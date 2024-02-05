/* Copyright © 2022-2023 Seneca Project Contributors, MIT License. */


import Pkg from '../package.json'


type FullBudProviderOptions = {
  url: string
  fetch: any
  debug: boolean
  print: {
    request: boolean
  }
  entity: Record<string, Record<string, any>>
  retry: {
    config: Record<string, any>
  }
  wait: {
    refresh: {
      max: number,
      interval: number,
    }
  }
  limit: {
    retry: number
  }
  store: {
    saveToken: any
    loadToken: any
  }
}

type BudProviderOptions = Partial<FullBudProviderOptions>


// Default options.
const defaults: BudProviderOptions = {

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
    saveToken: async (_kind: string, _val: string) => null,
    loadToken: async (_kind: string) => null,
  }
}


function BudProvider(this: any, options: FullBudProviderOptions) {
  const seneca: any = this

  const { Gubu } = seneca.util
  const { Open } = Gubu

  const CustomerQueryShape = Gubu(Open({
    customerid: String,
    customersecret: String,
  }))


  const CustomerHeadersShape = Gubu({
    'X-Customer-Id': String,
    'X-Customer-Secret': String,
  })

  const CustomerHeadersIDOnlyShape = Gubu({
    'X-Customer-Id': String,
  })

  const CustomerHeadersGatewayShape = Gubu({
    'X-Client-Id': String,
    'X-Customer-Id': String,
    'X-Customer-Secret': String,
  })

  const SharedHeadersShape = Gubu({
    'X-Client-Id': String,
    Authorization: String,
  })


  // Shared config reference.
  const config: any = {
    headers: {},
  }

  const statsCounters = {
    refresh: 0,  // count of refresh token fetches
    access: 0,   // count of access token fetches
    loadrefresh: 0, // count of refresh token loads
    loadaccess: 0, // count of access token loads
    req: 0,      // count of requests
    res: 0,      // count of non-error responses
    error: 0,    // error count,
    notfound: 0, // count of not founds
  }


  let refreshToken: any
  let accessToken: any
  let tokenState: 'init' | 'start' | 'request' | 'refresh' | 'active' = 'init'
  let retryCount = 0
  let isStart = true

  const makeUtils = this.export('provider/makeUtils')

  const {
    makeUrl,
    get,
    post,
    entityBuilder,
    origFetcher,
    asyncLocalStorage,
  } = makeUtils({
    name: 'bud',
    url: options.url,
    config,
    retry: {
      config: {
        retryOn,
        ...options.retry.config,
      }
    }
  })


  const budGet = async function(traceid: string, ...args: any[]) {
    logreq(traceid, 'orig', 'GET', 0, args)
    return get(...args)
  }

  const budPost = async function(traceid: string, ...args: any[]) {
    logreq(traceid, 'orig', 'POST', 0, args)
    return post(...args)
  }


  function logreq(traceid: string, phase: string, method: string, attempt: number, args: any[]) {
    args[1] = (args[1] || {})
    args[1].headers = (args[1].headers || {})
    const tid = args[1].headers['X-SenecaBudProvider-TraceID'] =
      (args[1].headers['X-SenecaBudProvider-TraceID'] || (traceid || seneca.util.Nid()))
    options.print.request &&
      console.log('BUDREQ', method, seneca.id, tid, phase, attempt, tokenState,
        refreshToken && refreshToken.substring(0, 8),
        accessToken && accessToken.substring(0, 8),
        JSI(statsCounters),
        JSI(args[0]),
        JSI(args[1]),
      )
  }


  seneca.message('sys:provider,provider:bud,get:info', get_info)

  async function get_info(this: any, _msg: any) {
    return {
      ok: true,
      name: 'bud',
      version: Pkg.version,
      sdk: {
        name: 'bud',
      },
    }
  }


  function stats() {
    return statsCounters
  }

  function logstats(mark: string) {
    console.log('BUDSTATS', mark, JSON.stringify(stats()).replace(/"/g, ''))
  }


  const entity: any = {
    customer: { cmd: { load: {}, save: {} } },
    connection: { cmd: { load: {} } },
    account: { cmd: { load: {}, list: {} } },
    transaction: { cmd: { list: {} } },

    // Open Banking Providers (banks and other institutions)
    obp: { cmd: { list: {} } },
  }


  entity.customer.cmd.load.action =
    async function(this: any, entize: any, msg: any) {
      let q = { ...(msg.q || {}) }
      let id = q.id

      try {
        statsCounters.req++

        const traceid = 'T' + seneca.util.Nid()
        await waitForToken('customer.cmd.load', traceid)

        let json = await budGet(traceid, makeUrl('v1/customers', id, 'context'))
        let entdata = json.data
        entdata.id = id

        statsCounters.res++
        return entize(entdata)
      }
      catch (e: any) {
        let res = e.provider?.response

        if (404 === res?.status) {
          statsCounters.notfound++
          return null
        }

        statsCounters.error++
        throw e
      }
      finally {
        options.debug && logstats('customer-load')
      }
    }


  entity.customer.cmd.save.action =
    async function(this: any, entize: any, msg: any) {
      try {
        statsCounters.req++
        let body = {
          customer_context: {
            ...(options.entity?.customer?.save || {}),
            ...(msg.ent.data$(false)),
          }
        }

        const traceid = 'T' + seneca.util.Nid()
        await waitForToken('customer.cmd.save', traceid)

        let json = await budPost(traceid, makeUrl('platform/v3/customers'), {
          body
        })

        let entdata = json.data
        entdata.id = entdata.customer_id

        statsCounters.res++
        return entize(entdata)
      }
      catch (e: any) {
        statsCounters.error++
        throw e
      }
      finally {
        options.debug && logstats('customer-save')
      }
    }


  entity.connection.cmd.load.action =
    async function(this: any, entize: any, msg: any) {
      let q = { ...(msg.q || {}) }
      let id = q.id
      let customerid = q.customerid

      try {
        statsCounters.req++
        let headers = CustomerHeadersIDOnlyShape({
          'X-Customer-Id': customerid
        })

        const traceid = 'T' + seneca.util.Nid()
        await waitForToken('account.cmd.load', traceid)

        let json = await budGet(traceid, makeUrl('v1/open-banking/connect', id), {
          headers
        })

        let entdata = json.data
        entdata.id = id

        statsCounters.res++
        return entize(entdata)
      }
      catch (e: any) {
        let res = e.provider?.response

        if (404 === res?.status) {
          statsCounters.notfound++
          return null
        }

        statsCounters.error++
        throw e
      }
      finally {
        options.debug && logstats('connection-load')
      }
    }


  entity.account.cmd.load.action =
    async function(this: any, entize: any, msg: any) {
      let q = CustomerQueryShape({ ...(msg.q || {}) })
      let id = q.id
      let customerid = q.customerid
      let customersecret = q.customersecret

      try {
        statsCounters.req++
        let headers = CustomerHeadersShape({
          'X-Customer-Id': customerid,
          'X-Customer-Secret': customersecret,
        })

        const traceid = 'T' + seneca.util.Nid()
        await waitForToken('account.cmd.load', traceid)

        let json = await budGet(traceid, makeUrl('financial/v2/accounts/', id), {
          headers
        })

        let entdata = json.data
        entdata.id = id

        statsCounters.res++
        return entize(entdata)
      }
      catch (e: any) {
        let res = e.provider?.response

        if (404 === res?.status) {
          statsCounters.notfound++
          return null
        }

        statsCounters.error++
        throw e
      }
      finally {
        options.debug && logstats('account-load')
      }
    }


  entity.account.cmd.list.action =
    async function(this: any, entize: any, msg: any) {
      let q = CustomerQueryShape({ ...(msg.q || {}) })
      let customerid = q.customerid
      let customersecret = q.customersecret

      delete q.customerid
      delete q.customersecret

      try {
        statsCounters.req++
        let headers = CustomerHeadersShape({
          'X-Customer-Id': customerid,
          'X-Customer-Secret': customersecret,
        })

        const traceid = 'T' + seneca.util.Nid()
        await waitForToken('account.cmd.list', traceid)

        let json = await budGet(traceid, makeUrl('financial/v2/accounts', q), {
          headers
        })

        let listdata = json.data
        let list = listdata.map((entry: any) => {
          let ent = entize(entry)
          ent.id = ent.account_id
          return ent
        })

        statsCounters.res++
        return list
      }
      catch (e: any) {
        let res = e.provider?.response

        if (404 === res?.status) {
          statsCounters.notfound++
          return null
        }

        statsCounters.error++
        throw e
      }
      finally {
        options.debug && logstats('account-list')
      }
    }



  entity.transaction.cmd.list.action =
    async function(this: any, entize: any, msg: any) {
      let q = CustomerQueryShape({ ...(msg.q || {}) })
      let customerid = q.customerid
      let customersecret = q.customersecret

      delete q.customerid
      delete q.customersecret

      try {
        statsCounters.req++
        let headers = CustomerHeadersShape({
          'X-Customer-Id': customerid,
          'X-Customer-Secret': customersecret,
        })

        let listdata: any[] = []
        let paging = true
        let pI = 0
        let nextPageToken: string | null | undefined = null
        const maxPages = 1111

        const traceid = 'T' + seneca.util.Nid()
        await waitForToken('transaction.cmd.list', traceid)

        while (paging && pI < maxPages) {
          if (nextPageToken) {
            q.page_token = nextPageToken
          }

          let json = await budGet(traceid, makeUrl('financial/v2/transactions', q), {
            headers
          })

          listdata = listdata.concat(json.data)

          pI++

          nextPageToken = json.metadata?.next_page_token

          if (null == nextPageToken) {
            paging = false
          }
        }

        let list = listdata.map((entry: any) => {
          let ent = entize(entry)
          ent.id = ent.account_id
          return ent
        })

        statsCounters.res++
        return list
      }
      catch (e: any) {
        let res = e.provider?.response

        if (404 === res?.status) {
          statsCounters.notfound++
          return null
        }

        statsCounters.error++
        throw e
      }
      finally {
        options.debug && logstats('transactions-list')
      }
    }


  entity.obp.cmd.list.action =
    async function(this: any, entize: any, msg: any) {
      let q = { ...(msg.q || {}) }

      try {
        statsCounters.req++

        const traceid = 'T' + seneca.util.Nid()
        await waitForToken('obp.cmd.list', traceid)

        let json = await budGet(traceid, makeUrl('v1/open-banking/providers'), q)
        let entlist = json.data
        entlist = entlist.map((entdata: any) => {
          entdata.id = entdata.provider
          return entize(entdata)
        })

        statsCounters.res++
        return entlist
      }
      catch (e: any) {
        statsCounters.error++
        throw e
      }
      finally {
        options.debug && logstats('obp-list')
      }
    }


  entityBuilder(this, {
    provider: {
      name: 'bud',
    },
    entity
  })


  async function getGateway(spec: {
    redirect_url: string
    clientid: string
    customerid: string
    customersecret: string
    account_id?: string
    mode?: string
  }) {
    try {
      statsCounters.req++
      let headers = CustomerHeadersGatewayShape({
        'X-Client-Id': spec.clientid,
        'X-Customer-Id': spec.customerid,
        'X-Customer-Secret': spec.customersecret
      })

      let body = {
        redirect_url: spec.redirect_url,
        initial_screen: (spec.mode === 'reconnect') ? 'reconfirm_consent' : undefined,
        reconfirm_consent_redirect: (spec.mode === 'reconnect') ? true : undefined,
      }

      const traceid = 'T' + seneca.util.Nid()

      let res = budPost(traceid, makeUrl('v2/open-banking/authorisation-gateway-url'), {
        headers,
        body,
      })

      statsCounters.res++
      return res
    }
    catch (e: any) {
      statsCounters.error++
      throw e
    }
    finally {
      options.debug && logstats('getGateway')
    }
  }


  async function getTokens() {
    const prev = {
      refreshToken,
      accessToken,
      config: JSI(config),
    }

    let refreshConfig = {
      method: 'POST',
      headers: {
        Authorization: seneca.shared.headers.Authorization,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    }

    statsCounters.refresh++
    options.debug && console.log('BUD-GT-REFRESH', tokenState)

    let refreshResult =
      await origFetcher(options.url + 'v1/oauth/token', refreshConfig)

    options.debug && console.log('BUD-GT-REFRESH-RESULT', refreshResult.status)

    if (200 !== refreshResult.status) {
      throw new Error('bud-provider: refresh-token: status:' + refreshResult.status)
    }

    let refreshJSON = await refreshResult.json()

    // TODO: don't store here
    refreshToken = refreshJSON.data.refresh_token
    await options.store.saveToken('refresh', refreshToken)

    // Force accessToken request
    accessToken = null

    if (null != refreshToken || isStart) {
      tokenState = 'refresh'
    }

    isStart = false

    options.debug && console.log('BUD-GT-REFRESH-DONE', tokenState,
      (refreshToken || '').substring(0, 22))

    let accessConfig = {
      method: 'POST',
      headers: {
        Authorization: seneca.shared.headers.Authorization,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Client-Id': seneca.shared.clientid
      },
      body: `grant_type=refresh_token&refresh_token=${refreshToken}`
    }

    statsCounters.access++
    options.debug && console.log('BUD-GT-ACCESS', tokenState)

    let accessResult =
      await origFetcher(options.url + 'v1/oauth/token', accessConfig)

    options.debug && console.log('BUD-GT-ACCESS-RESULT', accessResult.status)

    if (401 === accessResult.status) {
      refreshToken = null
      tokenState = 'start'
      return true
    }
    else if (200 !== accessResult.status) {
      throw new Error('bud-provider: access-token: status:' + accessResult.status)
    }

    let accessJSON = await accessResult.json()
    accessToken = accessJSON.data.access_token

    await options.store.saveToken('access', accessToken)

    let authContent = 'Bearer ' + accessToken

    config.headers['Authorization'] = authContent
    config.headers['X-Client-Id'] = seneca.shared.clientid

    tokenState = 'active'

    options.debug && console.log('BUD-GT-ACCESS-DONE', tokenState,
      (refreshToken || '').substring(0, 22),
      (accessToken || '').substring(0, 22),
    )

    const current = {
      refreshToken,
      accessToken,
      config: JSI(config),
    }

    return {
      when: Date.now(),
      prev,
      current,
    }
  }


  async function retryOn(
    attempt: number, error: any, response: any,
    fetchspec: { resource: any, options: any }
  ) {
    const traceid = (fetchspec?.options?.headers || {})['X-SenecaBudProvider-TraceID'] ||
      seneca.util.Nid()

    logreq(traceid, 'retry', (fetchspec?.options?.method || 'GET'), attempt,
      [fetchspec?.resource, fetchspec?.options])

    options.debug &&
      console.log('BUDRETRY', traceid, attempt, response?.status, tokenState, error?.message)
    options.debug && logstats('retryOn ' + traceid)

    if (error) {
      throw error
    }

    if (options.limit.retry < retryCount && 4 <= attempt) {
      throw new Error('bud-provider: global retry limit reached: ' + retryCount)
    }

    if (5 <= attempt) {
      options.debug && console.log('BUDRETRY-BAIL', traceid, attempt, response.status, tokenState)
      return false
    }

    if (500 <= response.status && attempt <= 3) {
      options.debug && console.log('BUDRETRY-500', traceid, attempt, response.status, tokenState)
      return true
    }

    if (401 === response.status) {
      options.debug && console.log('BUDRETRY-401', traceid, attempt, response.status, tokenState)

      // Try to refresh the access token first.
      if ('active' === tokenState) {
        tokenState = 'refresh'
      }

      try {
        options.debug && console.log('BUDRETRY-TOKEN-STATE-TOP', traceid, attempt, tokenState)

        if ('active' !== (tokenState as any) && 'refresh' !== tokenState) {
          tokenState = 'request'

          let lastRefreshToken = await options.store.loadToken('refresh')
          options.debug && console.log('BUDRETRY-LAST-REFRESH', traceid, attempt, lastRefreshToken, refreshToken)

          if (
            // Very first time, try to load the current refreshtoken
            isStart
            || (null != lastRefreshToken && '' != lastRefreshToken &&
              null != refreshToken && '' != refreshToken &&

              // token out of date if same as last attempt
              lastRefreshToken != refreshToken
            )) {
            refreshToken = lastRefreshToken
            statsCounters.loadrefresh++
            options.debug && console.log('BUDRETRY-USING-LAST-REFRESH', traceid, attempt, tokenState)
          }
          else {

            let refreshConfig = {
              method: 'POST',
              headers: {
                Authorization: seneca.shared.headers.Authorization,
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: 'grant_type=client_credentials'
            }

            statsCounters.refresh++
            options.debug && console.log('BUDRETRY-REFRESH', traceid, attempt, response.status, tokenState)

            let refreshResult =
              await origFetcher(options.url + 'v1/oauth/token', refreshConfig)

            options.debug && console.log('BUDRETRY-REFRESH-RESULT', traceid, refreshResult.status)

            if (200 !== refreshResult.status) {
              throw new Error('bud-provider: refresh-token: status:' + refreshResult.status)
            }

            let refreshJSON = await refreshResult.json()

            // TODO: don't store here
            refreshToken = refreshJSON.data.refresh_token
            await options.store.saveToken('refresh', refreshToken)

            // Force accessToken request
            accessToken = null
          }

          if (null != refreshToken || isStart) {
            tokenState = 'refresh'
          }

          isStart = false

          options.debug && console.log('BUDRETRY-REFRESH-DONE', traceid, tokenState,
            (refreshToken || '').substring(0, 22))
        }

        if ('refresh' === tokenState) {

          let lastAccessToken = await options.store.loadToken('access')
          options.debug && console.log('BUDRETRY-LAST-ACCESS', traceid, attempt, lastAccessToken, accessToken)

          if (
            null != lastAccessToken && '' != lastAccessToken &&
            null != accessToken && '' != accessToken &&
            lastAccessToken != accessToken) {
            accessToken = lastAccessToken
            statsCounters.loadaccess++
            options.debug && console.log('BUDRETRY-USING-LAST-ACCESS', traceid, attempt, tokenState)
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
            }

            statsCounters.access++
            options.debug && console.log('BUDRETRY-ACCESS', traceid, attempt, response.status, tokenState)

            let accessResult =
              await origFetcher(options.url + 'v1/oauth/token', accessConfig)

            options.debug && console.log('BUDRETRY-ACCESS-RESULT', traceid, accessResult.status)

            if (401 === accessResult.status) {
              refreshToken = null
              tokenState = 'start'
              return true
            }
            else if (200 !== accessResult.status) {
              throw new Error('bud-provider: access-token: status:' + accessResult.status)
            }

            let accessJSON = await accessResult.json()
            accessToken = accessJSON.data.access_token

            await options.store.saveToken('access', accessToken)
          }

          let store = asyncLocalStorage.getStore()
          let currentConfig = store.config

          let authContent = 'Bearer ' + accessToken

          currentConfig.headers['Authorization'] = authContent
          config.headers['Authorization'] = authContent

          currentConfig.headers['X-Client-Id'] = seneca.shared.clientid
          config.headers['X-Client-Id'] = seneca.shared.clientid

          tokenState = 'active'

          options.debug && console.log('BUDRETRY-ACCESS-DONE', traceid, tokenState,
            (refreshToken || '').substring(0, 22),
            (accessToken || '').substring(0, 22),
          )

          return true
        }
      }
      catch (e) {
        tokenState = 'start'
        throw e
      }
    }
  }


  seneca.prepare(async function(this: any) {
    let res = await this.post(
      'sys:provider,get:keymap,provider:bud'
    )

    let clientid = res.keymap.clientid.value
    let clientsecret = res.keymap.clientsecret.value

    this.shared.clientid = clientid


    let basic = clientid + ':' + clientsecret
    let auth = Buffer.from(basic).toString('base64')

    this.shared.headers = SharedHeadersShape({
      'X-Client-Id': clientid,
      Authorization: 'Basic ' + auth
    })

  })


  async function waitForToken(_whence: string, traceid: string) {
    const initialTokenState = tokenState
    let start = Date.now(), i = 0

    if ('init' === tokenState) {
      tokenState = 'start'
      options.debug && console.log('BUDWAIT-INIT', traceid, initialTokenState, tokenState)
    }

    else if ('active' !== tokenState) {
      for (
        ; ('active' !== (tokenState as string)) &&
        i < 1111 &&
        ((Date.now() - start) < options.wait.refresh.max);
        i++
      ) {
        options.debug &&
          console.log('BUDWAIT-WAITING', traceid, initialTokenState, tokenState,
            i, Date.now() - start)
        await new Promise((r) => setTimeout(r, options.wait.refresh.interval))
      }

      options.debug &&
        console.log('BUDWAIT-WAITED', traceid, initialTokenState, tokenState,
          i, Date.now() - start)
    }

    options.debug && console.log('BUDWAIT-DONE', traceid, initialTokenState, tokenState,
      Date.now() - start)
  }


  return {
    exports: {
      getTokens,
      getGateway,
      sdk: () => null,
      stats: () => statsCounters,
      util: {
        getTokenState: () => tokenState,
        setTokenState: (tokenStateIn: typeof tokenState) => tokenState = tokenStateIn,
        getToken: (name: string) => {
          return 'refresh' === name ? refreshToken : 'access' === name ? accessToken : null
        },
        setToken: (name: string, value: string) => {
          if ('refresh' === name) {
            refreshToken = value
          }
          else if ('access' === name) {
            accessToken = value
            config.headers['Authorization'] = 'Bearer ' + value
          }
        }
      }
    }
  }
}


function JSI(o: any) {
  try {
    return (JSON.stringify(o) || '').replace(/"/g, '')
  }
  catch (e: any) {
    return o + ' JSI:' + e.message
  }
}


Object.assign(BudProvider, { defaults })

export default BudProvider

if ('undefined' !== typeof module) {
  module.exports = BudProvider
}
