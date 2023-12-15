"use strict";
/* Copyright © 2022-2023 Seneca Project Contributors, MIT License. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const package_json_1 = __importDefault(require("../package.json"));
// Default options.
const defaults = {
    // NOTE: include trailing /
    url: 'https://api-sandbox.thisisbud.com/',
    // Use global fetch by default - if exists
    fetch: ('undefined' === typeof fetch ? undefined : fetch),
    // TODO: Enable debug logging
    debug: false,
    // See @seneca/provider
    retry: {
        config: {
            retryDelay: 100,
        }
    },
    entity: {},
    wait: {
        refresh: {
            max: 11111,
            interval: 111,
        }
    },
    limit: {
        retry: 111, // Global maximum number of retries.
    },
};
function BudProvider(options) {
    const seneca = this;
    const { Gubu } = seneca.util;
    const { Open } = Gubu;
    const CustomerQueryShape = Gubu(Open({
        customerid: String,
        customersecret: String,
    }));
    // Shared config reference.
    const config = {
        headers: {}
    };
    let refreshToken;
    let accessToken;
    let tokenState = 'init';
    let retryCount = 0;
    const makeUtils = this.export('provider/makeUtils');
    const { makeUrl, get, post, entityBuilder, origFetcher, asyncLocalStorage, } = makeUtils({
        name: 'bud',
        url: options.url,
        config,
        retry: {
            config: {
                retryOn,
                ...options.retry.config,
            }
        }
    });
    // console.log('makeUtils', 'get', get)
    seneca.message('sys:provider,provider:bud,get:info', get_info);
    async function get_info(_msg) {
        return {
            ok: true,
            name: 'bud',
            version: package_json_1.default.version,
            sdk: {
                name: 'bud',
            },
        };
    }
    const entity = {
        customer: { cmd: { load: {}, save: {} } },
        connection: { cmd: { load: {} } },
        account: { cmd: { load: {}, list: {} } },
        transaction: { cmd: { list: {} } },
        // Open Banking Providers (banks and other institutions)
        obp: { cmd: { list: {} } },
    };
    entity.customer.cmd.load.action =
        async function (entize, msg) {
            var _a;
            let q = { ...(msg.q || {}) };
            let id = q.id;
            try {
                await waitForRefreshToken();
                let json = await get(makeUrl('v1/customers', id, 'context'));
                // console.log('LOAD CUSTOMER JSON', json)
                let entdata = json.data;
                entdata.id = id;
                return entize(entdata);
            }
            catch (e) {
                // console.log('LOAD CUSTOMER', e)
                let res = (_a = e.provider) === null || _a === void 0 ? void 0 : _a.response;
                if (404 === (res === null || res === void 0 ? void 0 : res.status)) {
                    return null;
                }
                throw e;
            }
        };
    entity.customer.cmd.save.action =
        async function (entize, msg) {
            var _a, _b;
            try {
                let body = {
                    customer_context: {
                        ...(((_b = (_a = options.entity) === null || _a === void 0 ? void 0 : _a.customer) === null || _b === void 0 ? void 0 : _b.save) || {}),
                        ...(msg.ent.data$(false)),
                    }
                };
                await waitForRefreshToken();
                let json = await post(makeUrl('platform/v3/customers'), {
                    body
                });
                // console.log('SAVE CUSTOMER JSON', json)
                let entdata = json.data;
                entdata.id = entdata.customer_id;
                return entize(entdata);
            }
            catch (e) {
                // console.log('SAVE CUSTOMER', e)
                // let res = e.provider?.response
                throw e;
            }
        };
    entity.connection.cmd.load.action =
        async function (entize, msg) {
            var _a;
            let q = { ...(msg.q || {}) };
            let id = q.id;
            let customerid = q.customerid;
            try {
                let headers = {
                    'X-Customer-Id': customerid
                };
                let json = await get(makeUrl('v1/open-banking/connect', id), {
                    headers
                });
                // console.log('LOAD CONNECT JSON', json)
                let entdata = json.data;
                entdata.id = id;
                return entize(entdata);
            }
            catch (e) {
                // console.log('LOAD CONNECT ERR', e)
                let res = (_a = e.provider) === null || _a === void 0 ? void 0 : _a.response;
                if (404 === (res === null || res === void 0 ? void 0 : res.status)) {
                    return null;
                }
                throw e;
            }
        };
    entity.account.cmd.load.action =
        async function (entize, msg) {
            var _a;
            let q = CustomerQueryShape({ ...(msg.q || {}) });
            let id = q.id;
            let customerid = q.customerid;
            let customersecret = q.customersecret;
            try {
                let headers = {
                    'X-Customer-Id': customerid,
                    'X-Customer-Secret': customersecret,
                };
                await waitForRefreshToken();
                let json = await get(makeUrl('financial/v2/accounts/', id), {
                    headers
                });
                // console.log('LOAD CONNECT JSON', json)
                let entdata = json.data;
                entdata.id = id;
                return entize(entdata);
            }
            catch (e) {
                // console.log('LOAD CONNECT ERR', e)
                let res = (_a = e.provider) === null || _a === void 0 ? void 0 : _a.response;
                if (404 === (res === null || res === void 0 ? void 0 : res.status)) {
                    return null;
                }
                throw e;
            }
        };
    entity.account.cmd.list.action =
        async function (entize, msg) {
            var _a;
            let q = CustomerQueryShape({ ...(msg.q || {}) });
            let customerid = q.customerid;
            let customersecret = q.customersecret;
            delete q.customerid;
            delete q.customersecret;
            try {
                let headers = {
                    'X-Customer-Id': customerid,
                    'X-Customer-Secret': customersecret,
                };
                await waitForRefreshToken();
                let json = await get(makeUrl('financial/v2/accounts', q), {
                    headers
                });
                // console.log('LOAD CONNECT JSON', json)
                let listdata = json.data;
                let list = listdata.map((entry) => {
                    let ent = entize(entry);
                    ent.id = ent.account_id;
                    return ent;
                });
                return list;
            }
            catch (e) {
                // console.log('LIST ACCOUNT ERR', e)
                let res = (_a = e.provider) === null || _a === void 0 ? void 0 : _a.response;
                if (404 === (res === null || res === void 0 ? void 0 : res.status)) {
                    return null;
                }
                throw e;
            }
        };
    entity.transaction.cmd.list.action =
        async function (entize, msg) {
            var _a, _b;
            let q = CustomerQueryShape({ ...(msg.q || {}) });
            let customerid = q.customerid;
            let customersecret = q.customersecret;
            delete q.customerid;
            delete q.customersecret;
            try {
                let headers = {
                    'X-Customer-Id': customerid,
                    'X-Customer-Secret': customersecret,
                };
                let listdata = [];
                let paging = true;
                let pI = 0;
                let nextPageToken = null;
                const maxPages = 1111;
                console.log('LIST REQ', q, headers);
                await waitForRefreshToken();
                while (paging && pI < maxPages) {
                    if (nextPageToken) {
                        q.page_token = nextPageToken;
                    }
                    let json = await get(makeUrl('financial/v2/transactions', q), {
                        headers
                    });
                    console.log('LIST RES', json.data.length);
                    // console.log('LIST TX JSON', pI, json.data.length, json.data[0])
                    listdata = listdata.concat(json.data);
                    pI++;
                    nextPageToken = (_a = json.metadata) === null || _a === void 0 ? void 0 : _a.next_page_token;
                    if (null == nextPageToken) {
                        paging = false;
                    }
                }
                let list = listdata.map((entry) => {
                    let ent = entize(entry);
                    ent.id = ent.account_id;
                    return ent;
                });
                return list;
            }
            catch (e) {
                console.log('LIST TX ERR', e);
                let res = (_b = e.provider) === null || _b === void 0 ? void 0 : _b.response;
                if (404 === (res === null || res === void 0 ? void 0 : res.status)) {
                    return null;
                }
                throw e;
            }
        };
    entity.obp.cmd.list.action =
        async function (entize, msg) {
            let q = { ...(msg.q || {}) };
            try {
                await waitForRefreshToken();
                let json = await get(makeUrl('v1/open-banking/providers'), q);
                let entlist = json.data;
                entlist = entlist.map((entdata) => {
                    entdata.id = entdata.provider;
                    return entize(entdata);
                });
                return entlist;
            }
            catch (e) {
                throw e;
            }
        };
    entityBuilder(this, {
        provider: {
            name: 'bud',
        },
        entity
    });
    async function getGateway(spec) {
        let headers = {
            'X-Client-Id': spec.clientid,
            'X-Customer-Id': spec.customerid,
            'X-Customer-Secret': spec.customersecret
        };
        let body = {
            redirect_url: spec.redirect_url
        };
        let res = post(makeUrl('v2/open-banking/authorisation-gateway-url'), {
            headers,
            body,
        });
        return res;
    }
    async function retryOn(attempt, _error, response) {
        const mark = Math.random();
        console.log('RETRY start', mark, attempt, retryCount, response === null || response === void 0 ? void 0 : response.status, response === null || response === void 0 ? void 0 : response.statusText, tokenState, null == refreshToken);
        if (options.limit.retry < retryCount && 4 <= attempt) {
            throw new Error('bud-provider: global retry limit reached: ' + retryCount);
        }
        if (4 <= attempt) {
            console.log('RETRY attempt', mark, attempt, response === null || response === void 0 ? void 0 : response.status, tokenState, null == refreshToken);
            return false;
        }
        if (500 <= response.status && attempt <= 3) {
            console.log('RETRY 500', mark, attempt, response === null || response === void 0 ? void 0 : response.status, tokenState, null == refreshToken);
            return true;
        }
        if (401 === response.status) {
            console.log('RETRY 401', mark, attempt, response === null || response === void 0 ? void 0 : response.status, tokenState, null == refreshToken);
            // Try to refresh the access token first.
            if ('active' === tokenState) {
                tokenState = 'refresh';
            }
            try {
                if ('start' === tokenState) {
                    tokenState = 'request';
                    console.log('RETRY REFRESH', mark, attempt, response.status, tokenState, null == refreshToken);
                    let refreshConfig = {
                        method: 'POST',
                        headers: {
                            Authorization: seneca.shared.headers.Authorization,
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: 'grant_type=client_credentials'
                    };
                    console.log('GET REFRESH', mark, refreshConfig);
                    let refreshResult = await origFetcher(options.url + 'v1/oauth/token', refreshConfig);
                    if (200 !== refreshResult.status) {
                        console.log('REFRESH TOKEN FAIL', refreshConfig, refreshResult.status);
                        throw new Error('bud-provider: refresh-token: status:' + refreshResult.status);
                    }
                    options.debug &&
                        console.log('REFRESH RESULT', mark, refreshConfig, refreshResult.status);
                    let refreshJSON = await refreshResult.json();
                    options.debug &&
                        console.log('REFRESH JSON', mark, refreshJSON);
                    // TODO: don't store here
                    refreshToken = refreshJSON.data.refresh_token;
                    options.debug &&
                        console.log('REFRESH TOKEN', mark, attempt, refreshToken);
                    if (null != refreshToken) {
                        tokenState = 'refresh';
                    }
                    return true;
                }
                else if ('refresh' === tokenState) {
                    console.log('RETRY ACCESS', mark, attempt, response.status, tokenState, null == refreshToken);
                    console.log('GET ACCESS', mark, config.headers);
                    let accessConfig = {
                        method: 'POST',
                        headers: {
                            Authorization: seneca.shared.headers.Authorization,
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'X-Client-Id': seneca.shared.clientid
                        },
                        body: `grant_type=refresh_token&refresh_token=${refreshToken}`
                    };
                    let accessResult = await origFetcher(options.url + 'v1/oauth/token', accessConfig);
                    console.log('ACCESS RES', accessConfig, accessResult.status);
                    // console.log('access res', accessResult.status)
                    if (401 === accessResult.status) {
                        console.log('ACCESS TOKEN RESTART', accessConfig, accessResult.status);
                        refreshToken = null;
                        tokenState = 'start';
                        return true;
                    }
                    else if (200 !== accessResult.status) {
                        console.log('ACCESS TOKEN FAIL', accessConfig, accessResult);
                        throw new Error('bud-provider: access-token: status:' + accessResult.status);
                    }
                    let accessJSON = await accessResult.json();
                    console.log('ACCESS JSON', accessJSON);
                    accessToken = accessJSON.data.access_token;
                    let store = asyncLocalStorage.getStore();
                    // console.log('store', store)
                    let currentConfig = store.config;
                    let authContent = 'Bearer ' + accessToken;
                    currentConfig.headers['Authorization'] = authContent;
                    config.headers['Authorization'] = authContent;
                    currentConfig.headers['X-Client-Id'] = seneca.shared.clientid;
                    config.headers['X-Client-Id'] = seneca.shared.clientid;
                    // console.log('store end', store)
                    tokenState = 'active';
                    console.log('ACCESS TOKEN ACTIVE', config);
                    return true;
                }
            }
            catch (e) {
                tokenState = 'start';
                console.log('RETRY ERROR', mark, e);
                throw e;
            }
        }
    }
    seneca.prepare(async function () {
        let res = await this.post('sys:provider,get:keymap,provider:bud');
        let clientid = res.keymap.clientid.value;
        let clientsecret = res.keymap.clientsecret.value;
        this.shared.clientid = clientid;
        let basic = clientid + ':' + clientsecret;
        let auth = Buffer.from(basic).toString('base64');
        // console.log('BASIC', basic, auth)
        this.shared.headers = {
            'X-Client-Id': clientid,
            Authorization: 'Basic ' + auth
        };
    });
    async function waitForRefreshToken() {
        if ('init' === tokenState) {
            tokenState = 'start';
            return;
        }
        if ('active' !== tokenState) {
            let start = Date.now(), i = 0, mark = Math.random();
            console.log('waitForRefreshToken', tokenState, mark);
            for (; ('active' !== tokenState) &&
                i < 1111 &&
                ((Date.now() - start) < options.wait.refresh.max); i++) {
                await new Promise((r) => setTimeout(r, options.wait.refresh.interval));
            }
            console.log('waitForRefreshToken', tokenState, mark, i, Date.now() - start);
            if ('active' !== tokenState || null == refreshToken) {
                throw new Error('bud-provider: token-not-available: state:' + tokenState);
            }
        }
    }
    return {
        exports: {
            getGateway,
            sdk: () => null,
            getToken: (name) => {
                return 'refresh' === name ? refreshToken : 'access' === name ? accessToken : null;
            },
            setToken: (name, value) => {
                if ('refresh' === name) {
                    refreshToken = value;
                }
                else if ('access' === name) {
                    accessToken = value;
                    config.headers['Authorization'] = 'Bearer ' + value;
                    console.log('SET ACCESS', value);
                }
            }
        }
    };
}
Object.assign(BudProvider, { defaults });
exports.default = BudProvider;
if ('undefined' !== typeof module) {
    module.exports = BudProvider;
}
//# sourceMappingURL=bud-provider.js.map