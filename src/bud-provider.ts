/* Copyright © 2022 Seneca Project Contributors, MIT License. */

const Pkg = require('../package.json')


type BudProviderOptions = {
  url: string
  fetch: any
  debug: boolean
  entity: Record<string, Record<string, any>>
  retry: {
    config: Record<string, any>
  }
}


function BudProvider(this: any, options: BudProviderOptions) {
  const seneca: any = this

  // Shared config reference.
  const config: any = {
    headers: {}
  }

  let refreshToken: any

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

  console.log('POST', post)


  seneca.message('sys:provider,provider:bud,get:info', get_info)

  async function get_info(this: any, _msg: any) {
    return {
      ok: true,
      name: 'bud',
      version: Pkg.version,
      sdk: {
        name: 'bud',
        version: Pkg.dependencies['bud-api'],
      },
    }
  }


  const entity: any = {
    customer: { cmd: { load: {}, save: {} } },
    connection: { cmd: { load: {} } },
  }

  entity.customer.cmd.load.action =
    async function(this: any, entize: any, msg: any) {
      let q = msg.q || {}
      let id = q.id

      try {
        let json = await get(makeUrl('v1/customers', id, 'context'))
        // console.log('LOAD CUSTOMER JSON', json)
        let entdata = json.data
        entdata.id = id
        return entize(entdata)
      }
      catch (e: any) {
        // console.log('LOAD CUSTOMER', e)
        let res = e.provider?.response

        if (404 === res.status) {
          return null
        }

        throw e
      }
    }

  entity.customer.cmd.save.action =
    async function(this: any, entize: any, msg: any) {
      try {
        let body = {
          customer_context: {
            ...(options.entity?.customer?.save || {}),
            ...(msg.ent.data$(false)),
          }
        }

        let json = await post(makeUrl('platform/v3/customers'), {
          body
        })

        // console.log('SAVE CUSTOMER JSON', json)
        let entdata = json.data
        entdata.id = entdata.customer_id
        return entize(entdata)
      }
      catch (e: any) {
        // console.log('SAVE CUSTOMER', e)
        // let res = e.provider?.response

        throw e
      }
    }


  entity.connection.cmd.load.action =
    async function(this: any, entize: any, msg: any) {
      let q = msg.q || {}
      let id = q.id
      let customerid = q.customerid

      try {
        let headers = {
          'X-Customer-Id': customerid
        }

        let json = await get(makeUrl('v1/open-banking/connect', id), {
          headers
        })

        console.log('LOAD CONNECT JSON', json)
        let entdata = json.data
        entdata.id = id
        return entize(entdata)
      }
      catch (e: any) {
        console.log('LOAD CONNECT ERR', e)
        let res = e.provider?.response

        if (404 === res.status) {
          return null
        }

        throw e
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
  }) {
    let headers = {
      'X-Client-Id': spec.clientid,
      'X-Customer-Id': spec.customerid,
      'X-Customer-Secret': spec.customersecret
    }
    let body = {
      redirect_url: spec.redirect_url
    }
    let res = post(makeUrl('v2/open-banking/authorisation-gateway-url'), {
      headers,
      body,
    })

    return res
  }


  async function retryOn(attempt: number, _error: any, response: any) {
    if (4 <= attempt) {
      return false
    }

    if (500 <= response.status && attempt <= 3) {
      return true
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
          }

          // console.log('GET REFRESH', refreshConfig)

          let refreshResult =
            await origFetcher(options.url + 'v1/oauth/token', refreshConfig)

          // console.log('REFRESH RES', refreshConfig, refreshResult)

          let refreshJSON = await refreshResult.json()
          // console.log('REFRESH JSON', refreshJSON)

          // TODO: don't store here
          refreshToken = refreshJSON.data.refresh_token

          // console.log('REFRESH TOKEN', refreshToken)

          return true
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
          }
          let accessResult =
            await origFetcher(options.url + 'v1/oauth/token', accessConfig)

          // console.log('ACCESS RES', accessConfig, accessResult)

          // console.log('access res', accessResult.status)
          if (401 === accessResult.status) {
            refreshToken = null
            return true
          }

          let accessJSON = await accessResult.json()
          // console.log('ACCESS JSON', accessJSON)

          let accessToken = accessJSON.data.access_token

          let store = asyncLocalStorage.getStore()
          // console.log('store', store)
          let currentConfig = store.config

          let authContent = 'Bearer ' + accessToken

          currentConfig.headers['Authorization'] = authContent
          config.headers['Authorization'] = authContent

          currentConfig.headers['X-Client-Id'] = seneca.shared.clientid
          config.headers['X-Client-Id'] = seneca.shared.clientid

          // console.log('store end', store)

          return true
        }
      }
      catch (e) {
        console.log('RETRY', e)
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

    console.log('BASIC', basic, auth)

    this.shared.headers = {
      'X-Client-Id': clientid,
      Authorization: 'Basic ' + auth
    }

  })

  return {
    exports: {
      getGateway,
      sdk: () => null
    },
  }
}


// Default options.
const defaults: BudProviderOptions = {

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
}

Object.assign(BudProvider, { defaults })

export default BudProvider

if ('undefined' !== typeof module) {
  module.exports = BudProvider
}
