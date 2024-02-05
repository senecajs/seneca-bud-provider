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
            max: 1111,
            interval: 111,
        }
    },
    limit: {
        retry: 111, // Global maximum number of retries.
    },
    store: {
        saveToken: async (_kind, val) => null,
        loadToken: async (_kind) => null,
    }
};
function BudProvider(options) {
    const seneca = this;
    const { Gubu } = seneca.util;
    const { Open } = Gubu;
    const CustomerQueryShape = Gubu(Open({
        customerid: String,
        customersecret: String,
    }));
    const CustomerHeadersShape = Gubu({
        'X-Customer-Id': String,
        'X-Customer-Secret': String,
    });
    const CustomerHeadersIDOnlyShape = Gubu({
        'X-Customer-Id': String,
    });
    const CustomerHeadersGatewayShape = Gubu({
        'X-Client-Id': String,
        'X-Customer-Id': String,
        'X-Customer-Secret': String,
    });
    const SharedHeadersShape = Gubu({
        'X-Client-Id': String,
        Authorization: String,
    });
    // Shared config reference.
    const config = {
        headers: {},
        stats: {
            refresh: 0, // count of refresh token fetches
            access: 0, // count of access token fetches
            loadrefresh: 0, // count of refresh token loads
            loadaccess: 0, // count of access token loads
            req: 0, // count of requests
            res: 0, // count of non-error responses
            error: 0, // error count,
            notfound: 0, // count of not founds
        }
    };
    let refreshToken;
    let accessToken;
    let tokenState = 'init';
    let retryCount = 0;
    let isStart = true;
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
    function stats() {
        return config.stats;
    }
    function logstats(mark) {
        console.log('BUDSTATS', mark, JSON.stringify(stats()).replace(/"/g, ''));
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
                config.stats.req++;
                await waitForRefreshToken('customer.cmd.load');
                let json = await get(makeUrl('v1/customers', id, 'context'));
                let entdata = json.data;
                entdata.id = id;
                config.stats.res++;
                return entize(entdata);
            }
            catch (e) {
                let res = (_a = e.provider) === null || _a === void 0 ? void 0 : _a.response;
                if (404 === (res === null || res === void 0 ? void 0 : res.status)) {
                    config.stats.notfound++;
                    return null;
                }
                config.stats.error++;
                throw e;
            }
            finally {
                options.debug && logstats('customer-load');
            }
        };
    entity.customer.cmd.save.action =
        async function (entize, msg) {
            var _a, _b;
            try {
                config.stats.req++;
                let body = {
                    customer_context: {
                        ...(((_b = (_a = options.entity) === null || _a === void 0 ? void 0 : _a.customer) === null || _b === void 0 ? void 0 : _b.save) || {}),
                        ...(msg.ent.data$(false)),
                    }
                };
                await waitForRefreshToken('customer.cmd.save');
                let json = await post(makeUrl('platform/v3/customers'), {
                    body
                });
                let entdata = json.data;
                entdata.id = entdata.customer_id;
                config.stats.res++;
                return entize(entdata);
            }
            catch (e) {
                config.stats.error++;
                throw e;
            }
            finally {
                options.debug && logstats('customer-save');
            }
        };
    entity.connection.cmd.load.action =
        async function (entize, msg) {
            var _a;
            let q = { ...(msg.q || {}) };
            let id = q.id;
            let customerid = q.customerid;
            try {
                config.stats.req++;
                let headers = CustomerHeadersIDOnlyShape({
                    'X-Customer-Id': customerid
                });
                let json = await get(makeUrl('v1/open-banking/connect', id), {
                    headers
                });
                let entdata = json.data;
                entdata.id = id;
                config.stats.res++;
                return entize(entdata);
            }
            catch (e) {
                let res = (_a = e.provider) === null || _a === void 0 ? void 0 : _a.response;
                if (404 === (res === null || res === void 0 ? void 0 : res.status)) {
                    config.stats.notfound++;
                    return null;
                }
                config.stats.error++;
                throw e;
            }
            finally {
                options.debug && logstats('connection-load');
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
                config.stats.req++;
                let headers = CustomerHeadersShape({
                    'X-Customer-Id': customerid,
                    'X-Customer-Secret': customersecret,
                });
                await waitForRefreshToken('account.cmd.load');
                let json = await get(makeUrl('financial/v2/accounts/', id), {
                    headers
                });
                let entdata = json.data;
                entdata.id = id;
                config.stats.res++;
                return entize(entdata);
            }
            catch (e) {
                let res = (_a = e.provider) === null || _a === void 0 ? void 0 : _a.response;
                if (404 === (res === null || res === void 0 ? void 0 : res.status)) {
                    config.stats.notfound++;
                    return null;
                }
                config.stats.error++;
                throw e;
            }
            finally {
                options.debug && logstats('account-load');
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
                config.stats.req++;
                let headers = CustomerHeadersShape({
                    'X-Customer-Id': customerid,
                    'X-Customer-Secret': customersecret,
                });
                await waitForRefreshToken('account.cmd.list');
                let json = await get(makeUrl('financial/v2/accounts', q), {
                    headers
                });
                let listdata = json.data;
                let list = listdata.map((entry) => {
                    let ent = entize(entry);
                    ent.id = ent.account_id;
                    return ent;
                });
                config.stats.res++;
                return list;
            }
            catch (e) {
                let res = (_a = e.provider) === null || _a === void 0 ? void 0 : _a.response;
                if (404 === (res === null || res === void 0 ? void 0 : res.status)) {
                    config.stats.notfound++;
                    return null;
                }
                config.stats.error++;
                throw e;
            }
            finally {
                options.debug && logstats('account-list');
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
                config.stats.req++;
                let headers = CustomerHeadersShape({
                    'X-Customer-Id': customerid,
                    'X-Customer-Secret': customersecret,
                });
                let listdata = [];
                let paging = true;
                let pI = 0;
                let nextPageToken = null;
                const maxPages = 1111;
                await waitForRefreshToken('transaction.cmd.list');
                while (paging && pI < maxPages) {
                    if (nextPageToken) {
                        q.page_token = nextPageToken;
                    }
                    let json = await get(makeUrl('financial/v2/transactions', q), {
                        headers
                    });
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
                config.stats.res++;
                return list;
            }
            catch (e) {
                let res = (_b = e.provider) === null || _b === void 0 ? void 0 : _b.response;
                if (404 === (res === null || res === void 0 ? void 0 : res.status)) {
                    config.stats.notfound++;
                    return null;
                }
                config.stats.error++;
                throw e;
            }
            finally {
                options.debug && logstats('transactions-list');
            }
        };
    entity.obp.cmd.list.action =
        async function (entize, msg) {
            let q = { ...(msg.q || {}) };
            try {
                config.stats.req++;
                await waitForRefreshToken('obp.cmd.list');
                let json = await get(makeUrl('v1/open-banking/providers'), q);
                let entlist = json.data;
                entlist = entlist.map((entdata) => {
                    entdata.id = entdata.provider;
                    return entize(entdata);
                });
                config.stats.res++;
                return entlist;
            }
            catch (e) {
                config.stats.error++;
                throw e;
            }
            finally {
                options.debug && logstats('obp-list');
            }
        };
    entityBuilder(this, {
        provider: {
            name: 'bud',
        },
        entity
    });
    async function getGateway(spec) {
        try {
            config.stats.req++;
            let headers = CustomerHeadersGatewayShape({
                'X-Client-Id': spec.clientid,
                'X-Customer-Id': spec.customerid,
                'X-Customer-Secret': spec.customersecret
            });
            let body = {
                redirect_url: spec.redirect_url,
                initial_screen: (spec.mode === 'reconnect') ? 'reconfirm_consent' : undefined,
                reconfirm_consent_redirect: (spec.mode === 'reconnect') ? true : undefined,
            };
            let res = post(makeUrl('v2/open-banking/authorisation-gateway-url'), {
                headers,
                body,
            });
            config.stats.res++;
            return res;
        }
        catch (e) {
            config.stats.error++;
            throw e;
        }
        finally {
            options.debug && logstats('getGateway');
        }
    }
    async function retryOn(attempt, _error, response) {
        const mark = seneca.util.Nid();
        options.debug && console.log('BUDRETRY', mark, attempt, response.status, tokenState);
        options.debug && logstats('retryOn ' + mark);
        if (options.limit.retry < retryCount && 4 <= attempt) {
            throw new Error('bud-provider: global retry limit reached: ' + retryCount);
        }
        if (5 <= attempt) {
            options.debug && console.log('BUDRETRY-BAIL', mark, attempt, response.status, tokenState);
            return false;
        }
        if (500 <= response.status && attempt <= 3) {
            options.debug && console.log('BUDRETRY-500', mark, attempt, response.status, tokenState);
            return true;
        }
        if (401 === response.status) {
            options.debug && console.log('BUDRETRY-401', mark, attempt, response.status, tokenState);
            // Try to refresh the access token first.
            if ('active' === tokenState) {
                tokenState = 'refresh';
            }
            try {
                options.debug && console.log('BUDRETRY-TOKEN-STATE-TOP', mark, attempt, tokenState);
                if ('active' !== tokenState && 'refresh' !== tokenState) {
                    tokenState = 'request';
                    let lastRefreshToken = await options.store.loadToken('refresh');
                    options.debug && console.log('BUDRETRY-LAST-REFRESH', mark, attempt, lastRefreshToken, refreshToken);
                    if (
                    // Very first time, try to load the current refreshtoken
                    isStart
                        || (null != lastRefreshToken && '' != lastRefreshToken &&
                            null != refreshToken && '' != refreshToken &&
                            // token out of date if same as last attempt
                            lastRefreshToken != refreshToken)) {
                        refreshToken = lastRefreshToken;
                        config.stats.loadrefresh++;
                        options.debug && console.log('BUDRETRY-USING-LAST-REFRESH', mark, attempt, tokenState);
                    }
                    else {
                        let refreshConfig = {
                            method: 'POST',
                            headers: {
                                Authorization: seneca.shared.headers.Authorization,
                                'Content-Type': 'application/x-www-form-urlencoded'
                            },
                            body: 'grant_type=client_credentials'
                        };
                        config.stats.refresh++;
                        options.debug && console.log('BUDRETRY-REFRESH', mark, attempt, response.status, tokenState);
                        let refreshResult = await origFetcher(options.url + 'v1/oauth/token', refreshConfig);
                        options.debug && console.log('BUDRETRY-REFRESH-RESULT', mark, refreshResult.status);
                        if (200 !== refreshResult.status) {
                            throw new Error('bud-provider: refresh-token: status:' + refreshResult.status);
                        }
                        let refreshJSON = await refreshResult.json();
                        // TODO: don't store here
                        refreshToken = refreshJSON.data.refresh_token;
                        await options.store.saveToken('refresh', refreshToken);
                        // Force accessToken request
                        accessToken = null;
                    }
                    if (null != refreshToken || isStart) {
                        tokenState = 'refresh';
                    }
                    isStart = false;
                    options.debug && console.log('BUDRETRY-REFRESH-DONE', mark, tokenState, (refreshToken || '').substring(0, 22));
                }
                if ('refresh' === tokenState) {
                    let lastAccessToken = await options.store.loadToken('access');
                    options.debug && console.log('BUDRETRY-LAST-ACCESS', mark, attempt, lastAccessToken, accessToken);
                    if (null != lastAccessToken && '' != lastAccessToken &&
                        null != accessToken && '' != accessToken &&
                        lastAccessToken != accessToken) {
                        accessToken = lastAccessToken;
                        config.stats.loadaccess++;
                        options.debug && console.log('BUDRETRY-USING-LAST-ACCESS', mark, attempt, tokenState);
                    }
                    else {
                        let accessConfig = {
                            method: 'POST',
                            headers: {
                                Authorization: seneca.shared.headers.Authorization,
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'X-Client-Id': seneca.shared.clientid
                            },
                            body: `grant_type=refresh_token&refresh_token=${refreshToken}`
                        };
                        config.stats.access++;
                        options.debug && console.log('BUDRETRY-ACCESS', mark, attempt, response.status, tokenState);
                        let accessResult = await origFetcher(options.url + 'v1/oauth/token', accessConfig);
                        options.debug && console.log('BUDRETRY-ACCESS-RESULT', mark, accessResult.status);
                        if (401 === accessResult.status) {
                            refreshToken = null;
                            tokenState = 'start';
                            return true;
                        }
                        else if (200 !== accessResult.status) {
                            throw new Error('bud-provider: access-token: status:' + accessResult.status);
                        }
                        let accessJSON = await accessResult.json();
                        accessToken = accessJSON.data.access_token;
                        await options.store.saveToken('access', accessToken);
                    }
                    let store = asyncLocalStorage.getStore();
                    let currentConfig = store.config;
                    let authContent = 'Bearer ' + accessToken;
                    currentConfig.headers['Authorization'] = authContent;
                    config.headers['Authorization'] = authContent;
                    currentConfig.headers['X-Client-Id'] = seneca.shared.clientid;
                    config.headers['X-Client-Id'] = seneca.shared.clientid;
                    tokenState = 'active';
                    options.debug && console.log('BUDRETRY-ACCESS-DONE', mark, tokenState, (refreshToken || '').substring(0, 22), (accessToken || '').substring(0, 22));
                    return true;
                }
            }
            catch (e) {
                tokenState = 'start';
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
        this.shared.headers = SharedHeadersShape({
            'X-Client-Id': clientid,
            Authorization: 'Basic ' + auth
        });
    });
    async function waitForRefreshToken(_whence) {
        const mark = Math.random();
        const initialTokenState = tokenState;
        if ('init' === tokenState) {
            tokenState = 'start';
            options.debug && console.log('BUDWRT-A', mark, initialTokenState, tokenState);
            return;
        }
        if ('active' !== tokenState) {
            let start = Date.now(), i = 0;
            for (; ('active' !== tokenState) &&
                i < 1111 &&
                ((Date.now() - start) < options.wait.refresh.max); i++) {
                await new Promise((r) => setTimeout(r, options.wait.refresh.interval));
            }
            options.debug && console.log('BUDWRT-B', mark, initialTokenState, tokenState);
        }
        else {
            options.debug && console.log('BUDWRT-C', mark, initialTokenState, tokenState);
        }
    }
    return {
        exports: {
            getGateway,
            sdk: () => null,
            stats: () => config.stats,
            util: {
                getTokenState: () => tokenState,
                setTokenState: (tokenStateIn) => tokenState = tokenStateIn,
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
                    }
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