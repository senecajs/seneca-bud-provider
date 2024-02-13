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
    print: {
        request: false,
    },
    // See @seneca/provider
    retry: {
        config: {
            retryDelay: 100,
        }
    },
    entity: {},
    wait: {
        refresh: {
            max: 2222,
            interval: 222,
        }
    },
    limit: {
        retry: 111, // Global maximum number of retries.
    },
    store: {
        saveToken: async (_kind, _val) => null,
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
    };
    const statsCounters = {
        refresh: 0, // count of refresh token fetches
        access: 0, // count of access token fetches
        loadrefresh: 0, // count of refresh token loads
        loadaccess: 0, // count of access token loads
        req: 0, // count of requests
        res: 0, // count of non-error responses
        error: 0, // error count,
        notfound: 0, // count of not founds
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
    const budGet = async function (traceid, ...args) {
        logreq(traceid, 'orig', 'GET', 0, args);
        return get(...args);
    };
    const budPost = async function (traceid, ...args) {
        logreq(traceid, 'orig', 'POST', 0, args);
        return post(...args);
    };
    function logreq(traceid, phase, method, attempt, args) {
        args[1] = (args[1] || {});
        args[1].headers = (args[1].headers || {});
        const tid = args[1].headers['X-SenecaBudProvider-TraceID'] =
            (args[1].headers['X-SenecaBudProvider-TraceID'] || (traceid || seneca.util.Nid()));
        options.print.request &&
            console.log('SP-BUDREQ', method, seneca.id, tid, phase, attempt, tokenState, refreshToken && refreshToken.substring(0, 8), accessToken && accessToken.substring(0, 8), JSI(statsCounters), JSI(args[0]), JSI(args[1]));
    }
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
        return statsCounters;
    }
    function logstats(mark) {
        console.log('SP-BUDSTATS', mark, JSI(stats()));
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
                statsCounters.req++;
                const traceid = 'T' + seneca.util.Nid();
                await waitForToken('customer.cmd.load', traceid);
                let json = await budGet(traceid, makeUrl('v1/customers', id, 'context'));
                let entdata = json.data;
                entdata.id = id;
                statsCounters.res++;
                return entize(entdata);
            }
            catch (e) {
                let res = (_a = e.provider) === null || _a === void 0 ? void 0 : _a.response;
                if (404 === (res === null || res === void 0 ? void 0 : res.status)) {
                    statsCounters.notfound++;
                    return null;
                }
                statsCounters.error++;
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
                statsCounters.req++;
                let body = {
                    customer_context: {
                        ...(((_b = (_a = options.entity) === null || _a === void 0 ? void 0 : _a.customer) === null || _b === void 0 ? void 0 : _b.save) || {}),
                        ...(msg.ent.data$(false)),
                    }
                };
                const traceid = 'T' + seneca.util.Nid();
                await waitForToken('customer.cmd.save', traceid);
                let json = await budPost(traceid, makeUrl('platform/v3/customers'), {
                    body
                });
                let entdata = json.data;
                entdata.id = entdata.customer_id;
                statsCounters.res++;
                return entize(entdata);
            }
            catch (e) {
                statsCounters.error++;
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
                statsCounters.req++;
                let headers = CustomerHeadersIDOnlyShape({
                    'X-Customer-Id': customerid
                });
                const traceid = 'T' + seneca.util.Nid();
                await waitForToken('account.cmd.load', traceid);
                let json = await budGet(traceid, makeUrl('v1/open-banking/connect', id), {
                    headers
                });
                let entdata = json.data;
                entdata.id = id;
                statsCounters.res++;
                return entize(entdata);
            }
            catch (e) {
                let res = (_a = e.provider) === null || _a === void 0 ? void 0 : _a.response;
                if (404 === (res === null || res === void 0 ? void 0 : res.status)) {
                    statsCounters.notfound++;
                    return null;
                }
                statsCounters.error++;
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
                statsCounters.req++;
                let headers = CustomerHeadersShape({
                    'X-Customer-Id': customerid,
                    'X-Customer-Secret': customersecret,
                });
                const traceid = 'T' + seneca.util.Nid();
                await waitForToken('account.cmd.load', traceid);
                let json = await budGet(traceid, makeUrl('financial/v2/accounts/', id), {
                    headers
                });
                let entdata = json.data;
                entdata.id = id;
                statsCounters.res++;
                return entize(entdata);
            }
            catch (e) {
                let res = (_a = e.provider) === null || _a === void 0 ? void 0 : _a.response;
                if (404 === (res === null || res === void 0 ? void 0 : res.status)) {
                    statsCounters.notfound++;
                    return null;
                }
                statsCounters.error++;
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
                statsCounters.req++;
                let headers = CustomerHeadersShape({
                    'X-Customer-Id': customerid,
                    'X-Customer-Secret': customersecret,
                });
                const traceid = 'T' + seneca.util.Nid();
                await waitForToken('account.cmd.list', traceid);
                let json = await budGet(traceid, makeUrl('financial/v2/accounts', q), {
                    headers
                });
                let listdata = json.data;
                let list = listdata.map((entry) => {
                    let ent = entize(entry);
                    ent.id = ent.account_id;
                    return ent;
                });
                statsCounters.res++;
                return list;
            }
            catch (e) {
                let res = (_a = e.provider) === null || _a === void 0 ? void 0 : _a.response;
                if (404 === (res === null || res === void 0 ? void 0 : res.status)) {
                    statsCounters.notfound++;
                    return null;
                }
                statsCounters.error++;
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
                statsCounters.req++;
                let headers = CustomerHeadersShape({
                    'X-Customer-Id': customerid,
                    'X-Customer-Secret': customersecret,
                });
                let listdata = [];
                let paging = true;
                let pI = 0;
                let nextPageToken = null;
                const maxPages = 1111;
                const traceid = 'T' + seneca.util.Nid();
                await waitForToken('transaction.cmd.list', traceid);
                while (paging && pI < maxPages) {
                    if (nextPageToken) {
                        q.page_token = nextPageToken;
                    }
                    let json = await budGet(traceid, makeUrl('financial/v2/transactions', q), {
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
                statsCounters.res++;
                return list;
            }
            catch (e) {
                let res = (_b = e.provider) === null || _b === void 0 ? void 0 : _b.response;
                if (404 === (res === null || res === void 0 ? void 0 : res.status)) {
                    statsCounters.notfound++;
                    return null;
                }
                statsCounters.error++;
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
                statsCounters.req++;
                const traceid = 'T' + seneca.util.Nid();
                await waitForToken('obp.cmd.list', traceid);
                let json = await budGet(traceid, makeUrl('v1/open-banking/providers'), q);
                let entlist = json.data;
                entlist = entlist.map((entdata) => {
                    entdata.id = entdata.provider;
                    return entize(entdata);
                });
                statsCounters.res++;
                return entlist;
            }
            catch (e) {
                statsCounters.error++;
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
            statsCounters.req++;
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
            const traceid = 'T' + seneca.util.Nid();
            let res = budPost(traceid, makeUrl('v2/open-banking/authorisation-gateway-url'), {
                headers,
                body,
            });
            statsCounters.res++;
            return res;
        }
        catch (e) {
            statsCounters.error++;
            throw e;
        }
        finally {
            options.debug && logstats('getGateway');
        }
    }
    async function loadTokens() {
        refreshToken = await options.store.loadToken('refresh');
        accessToken = await options.store.loadToken('access');
        let authContent = 'Bearer ' + accessToken;
        config.headers['Authorization'] = authContent;
        config.headers['X-Client-Id'] = seneca.shared.clientid;
        tokenState = 'active';
        return {
            when: Date.now(),
            refreshToken,
            accessToken,
            tokenState,
            config,
        };
    }
    async function requestTokens() {
        const prev = {
            refreshToken,
            accessToken,
            config: JSI(config),
        };
        let refreshConfig = {
            method: 'POST',
            headers: {
                Authorization: seneca.shared.headers.Authorization,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        };
        statsCounters.refresh++;
        options.debug && console.log('SP-BUD-GT-REFRESH', tokenState);
        let refreshResult = await origFetcher(options.url + 'v1/oauth/token', refreshConfig);
        options.debug && console.log('SP-BUD-GT-REFRESH-RESULT', refreshResult.status);
        if (200 !== refreshResult.status) {
            throw new Error('bud-provider: refresh-token: status:' + refreshResult.status);
        }
        let refreshJSON = await refreshResult.json();
        // TODO: don't store here
        refreshToken = refreshJSON.data.refresh_token;
        await options.store.saveToken('refresh', refreshToken);
        // Force accessToken request
        accessToken = null;
        if (null != refreshToken || isStart) {
            tokenState = 'refresh';
        }
        isStart = false;
        options.debug && console.log('SP-BUD-GT-REFRESH-DONE', tokenState, (refreshToken || '').substring(0, 22));
        let accessConfig = {
            method: 'POST',
            headers: {
                Authorization: seneca.shared.headers.Authorization,
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Client-Id': seneca.shared.clientid
            },
            body: `grant_type=refresh_token&refresh_token=${refreshToken}`
        };
        statsCounters.access++;
        options.debug && console.log('SP-BUD-GT-ACCESS', tokenState);
        let accessResult = await origFetcher(options.url + 'v1/oauth/token', accessConfig);
        options.debug && console.log('SP-BUD-GT-ACCESS-RESULT', accessResult.status);
        if (401 === accessResult.status || 400 === accessResult.status) {
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
        let authContent = 'Bearer ' + accessToken;
        config.headers['Authorization'] = authContent;
        config.headers['X-Client-Id'] = seneca.shared.clientid;
        tokenState = 'active';
        options.debug && console.log('SP-BUD-GT-ACCESS-DONE', tokenState, (refreshToken || '').substring(0, 22), (accessToken || '').substring(0, 22));
        const current = {
            refreshToken,
            accessToken,
            config: JSI(config),
        };
        return {
            when: Date.now(),
            prev,
            current,
        };
    }
    async function retryOn(attempt, error, response, fetchspec) {
        var _a, _b;
        const traceid = (((_a = fetchspec === null || fetchspec === void 0 ? void 0 : fetchspec.options) === null || _a === void 0 ? void 0 : _a.headers) || {})['X-SenecaBudProvider-TraceID'] ||
            seneca.util.Nid();
        logreq(traceid, 'retry', (((_b = fetchspec === null || fetchspec === void 0 ? void 0 : fetchspec.options) === null || _b === void 0 ? void 0 : _b.method) || 'GET'), attempt, [fetchspec === null || fetchspec === void 0 ? void 0 : fetchspec.resource, fetchspec === null || fetchspec === void 0 ? void 0 : fetchspec.options]);
        options.debug &&
            console.log('SP-BUDRETRY', traceid, attempt, response === null || response === void 0 ? void 0 : response.status, tokenState, error === null || error === void 0 ? void 0 : error.message);
        options.debug && logstats('retryOn ' + traceid);
        if (error) {
            throw error;
        }
        if (options.limit.retry < retryCount && 4 <= attempt) {
            throw new Error('bud-provider: global retry limit reached: ' + retryCount);
        }
        if (5 <= attempt) {
            options.debug && console.log('SP-BUDRETRY-BAIL', traceid, attempt, response.status, tokenState);
            return false;
        }
        if (500 <= response.status && attempt <= 3) {
            options.debug && console.log('SP-BUDRETRY-500', traceid, attempt, response.status, tokenState);
            return true;
        }
        if (401 === response.status || 400 === response.status) {
            options.debug && console.log('SP-BUDRETRY-401', traceid, attempt, response.status, tokenState);
            // Try to refresh the access token first.
            if ('active' === tokenState) {
                tokenState = 'refresh';
            }
            try {
                options.debug && console.log('SP-BUDRETRY-TOKEN-STATE-TOP', traceid, attempt, tokenState);
                if ('active' !== tokenState && 'refresh' !== tokenState) {
                    tokenState = 'request';
                    let lastRefreshToken = await options.store.loadToken('refresh');
                    options.debug && console.log('SP-BUDRETRY-LAST-REFRESH', traceid, attempt, lastRefreshToken, refreshToken);
                    if (
                    // Very first time, try to load the current refreshtoken
                    isStart
                        || (null != lastRefreshToken && '' != lastRefreshToken &&
                            null != refreshToken && '' != refreshToken &&
                            // token out of date if same as last attempt
                            lastRefreshToken != refreshToken)) {
                        refreshToken = lastRefreshToken;
                        statsCounters.loadrefresh++;
                        options.debug && console.log('SP-BUDRETRY-USING-LAST-REFRESH', traceid, attempt, tokenState);
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
                        statsCounters.refresh++;
                        options.debug && console.log('SP-BUDRETRY-REFRESH', traceid, attempt, response.status, tokenState);
                        let refreshResult = await origFetcher(options.url + 'v1/oauth/token', refreshConfig);
                        options.debug && console.log('SP-BUDRETRY-REFRESH-RESULT', traceid, refreshResult.status);
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
                    options.debug && console.log('BUDRETRY-REFRESH-DONE', traceid, tokenState, (refreshToken || '').substring(0, 22));
                }
                if ('refresh' === tokenState) {
                    let lastAccessToken = await options.store.loadToken('access');
                    options.debug && console.log('BUDRETRY-LAST-ACCESS', traceid, attempt, lastAccessToken, accessToken);
                    if (null != lastAccessToken && '' != lastAccessToken &&
                        null != accessToken && '' != accessToken &&
                        lastAccessToken != accessToken) {
                        accessToken = lastAccessToken;
                        statsCounters.loadaccess++;
                        options.debug && console.log('BUDRETRY-USING-LAST-ACCESS', traceid, attempt, tokenState);
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
                        statsCounters.access++;
                        options.debug && console.log('BUDRETRY-ACCESS', traceid, attempt, response.status, tokenState);
                        let accessResult = await origFetcher(options.url + 'v1/oauth/token', accessConfig);
                        options.debug && console.log('BUDRETRY-ACCESS-RESULT', traceid, accessResult.status);
                        if (401 === accessResult.status || 400 === accessResult.status) {
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
                    options.debug && console.log('BUDRETRY-ACCESS-DONE', traceid, tokenState, (refreshToken || '').substring(0, 22), (accessToken || '').substring(0, 22));
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
    async function waitForToken(_whence, traceid) {
        const initialTokenState = tokenState;
        let start = Date.now(), i = 0;
        if ('init' === tokenState) {
            tokenState = 'start';
            options.debug && console.log('BUDWAIT-INIT', traceid, initialTokenState, tokenState);
        }
        else if ('active' !== tokenState) {
            for (; ('active' !== tokenState) &&
                i < 1111 &&
                ((Date.now() - start) < options.wait.refresh.max); i++) {
                options.debug &&
                    console.log('BUDWAIT-WAITING', traceid, initialTokenState, tokenState, i, Date.now() - start);
                await new Promise((r) => setTimeout(r, options.wait.refresh.interval));
            }
            options.debug &&
                console.log('BUDWAIT-WAITED', traceid, initialTokenState, tokenState, i, Date.now() - start);
        }
        options.debug && console.log('BUDWAIT-DONE', traceid, initialTokenState, tokenState, Date.now() - start);
    }
    return {
        exports: {
            requestTokens,
            loadTokens,
            getGateway,
            sdk: () => null,
            stats: () => statsCounters,
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
function JSI(o) {
    try {
        return (JSON.stringify(o) || '').replace(/["\n]/g, '');
    }
    catch (e) {
        return o + ' JSI:' + e.message;
    }
}
Object.assign(BudProvider, { defaults });
exports.default = BudProvider;
if ('undefined' !== typeof module) {
    module.exports = BudProvider;
}
//# sourceMappingURL=bud-provider.js.map