"use strict";
/* Copyright © 2022 Seneca Project Contributors, MIT License. */
Object.defineProperty(exports, "__esModule", { value: true });
const Pkg = require('../package.json');
function BudProvider(options) {
    const seneca = this;
    // Shared config reference.
    const config = {
        headers: {}
    };
    let refreshToken;
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
            version: Pkg.version,
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
            let q = msg.q || {};
            let id = q.id;
            try {
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
            let q = msg.q || {};
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
            let q = msg.q || {};
            let id = q.id;
            let customerid = q.customerid;
            let customersecret = q.customersecret;
            try {
                let headers = {
                    'X-Customer-Id': customerid,
                    'X-Customer-Secret': customersecret,
                };
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
            let q = msg.q || {};
            let customerid = q.customerid;
            let customersecret = q.customersecret;
            delete q.customerid;
            delete q.customersecret;
            try {
                let headers = {
                    'X-Customer-Id': customerid,
                    'X-Customer-Secret': customersecret,
                };
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
            let q = msg.q || {};
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
                while (paging && pI < maxPages) {
                    let json = await get(makeUrl('financial/v2/transactions', q), {
                        headers
                    });
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
            let q = msg.q || {};
            try {
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
        if (4 <= attempt) {
            return false;
        }
        if (500 <= response.status && attempt <= 3) {
            return true;
        }
        if (401 === response.status) {
            try {
                if (null == refreshToken) {
                    let refreshConfig = {
                        method: 'POST',
                        headers: {
                            Authorization: seneca.shared.headers.Authorization,
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: 'grant_type=client_credentials'
                    };
                    // console.log('GET REFRESH', refreshConfig)
                    let refreshResult = await origFetcher(options.url + 'v1/oauth/token', refreshConfig);
                    options.debug &&
                        console.log('REFRESH RESULT', refreshConfig, refreshResult);
                    let refreshJSON = await refreshResult.json();
                    // console.log('REFRESH JSON', refreshJSON)
                    // TODO: don't store here
                    refreshToken = refreshJSON.data.refresh_token;
                    // console.log('REFRESH TOKEN', refreshToken)
                    return true;
                }
                else {
                    // console.log('GET ACCESS', config.headers)
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
                    // console.log('ACCESS RES', accessConfig, accessResult)
                    // console.log('access res', accessResult.status)
                    if (401 === accessResult.status) {
                        refreshToken = null;
                        return true;
                    }
                    let accessJSON = await accessResult.json();
                    // console.log('ACCESS JSON', accessJSON)
                    let accessToken = accessJSON.data.access_token;
                    let store = asyncLocalStorage.getStore();
                    // console.log('store', store)
                    let currentConfig = store.config;
                    let authContent = 'Bearer ' + accessToken;
                    currentConfig.headers['Authorization'] = authContent;
                    config.headers['Authorization'] = authContent;
                    currentConfig.headers['X-Client-Id'] = seneca.shared.clientid;
                    config.headers['X-Client-Id'] = seneca.shared.clientid;
                    // console.log('store end', store)
                    return true;
                }
            }
            catch (e) {
                // console.log('RETRY', e)
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
    return {
        exports: {
            getGateway,
            sdk: () => null
        },
    };
}
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
    entity: {}
};
Object.assign(BudProvider, { defaults });
exports.default = BudProvider;
if ('undefined' !== typeof module) {
    module.exports = BudProvider;
}
//# sourceMappingURL=bud-provider.js.map