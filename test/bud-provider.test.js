/* Copyright © 2022-2023 Seneca Project Contributors, MIT License. */

const Fs = require('node:fs')
const Http = require('node:http')

const Seneca = require('seneca')
const SenecaMsgTest = require('seneca-msg-test')
const { Maintain } = require('@seneca/maintain')

const BudProvider = require('../dist/bud-provider')
const BudProviderDoc = require('../dist/BudProvider-doc')

const BasicMessages = require('./basic.messages.js')

// Live tests call the Bud sandbox API. They need a Bud client id and secret:
// test/local-config.js (see local-config-template.js) with the keys in
// test/local-env.js, or the environment variables BUD_CLIENTID and
// BUD_CLIENTSECRET. Without them the same tests run against a local mock of
// the Bud API, and the env plugin gets dummy keys.
let Config = undefined
if (Fs.existsSync(__dirname + '/local-config.js')) {
  Config = require('./local-config')
}
else if (process.env.BUD_CLIENTID && process.env.BUD_CLIENTSECRET) {
  Config = {}
}

const LIVE = null != Config

if (!LIVE) {
  process.env.BUD_CLIENTID ??= 'test-clientid'
  process.env.BUD_CLIENTSECRET ??= 'test-clientsecret'
}

let mock = null

beforeAll(async () => {
  if (!LIVE) {
    mock = await makeMockBudApi({
      clientid: process.env.BUD_CLIENTID,
      clientsecret: process.env.BUD_CLIENTSECRET,
    })
  }
})

afterAll(async () => {
  if (mock) {
    await mock.close()
  }
})

describe('bud-provider', () => {
  test('happy', async () => {
    expect(BudProvider).toBeDefined()
    expect(BudProviderDoc).toBeDefined()

    const seneca = await makeSeneca()

    expect(
      await seneca.post('sys:provider,provider:bud,get:info')
    ).toMatchObject({
      ok: true,
      name: 'bud',
    })

    await seneca.close()
  })

  test('messages', async () => {
    const seneca = await makeSeneca()
    await SenecaMsgTest(seneca, BasicMessages)()
    await seneca.close()
  })

  
  test('requestTokens', async () => {
    const seneca = await makeSeneca({debug:true, print:{request:true}})
    const requestTokens = seneca.export('BudProvider/requestTokens')

    const tokens = await requestTokens()
    console.dir(tokens,{depth:null})

    expect(tokens.when).toBeDefined()

    if (mock) {
      // A client credentials grant for the refresh token, then a refresh
      // token grant for the access token.
      expect(mock.calls.map(callDesc)).toEqual([
        'POST /v1/oauth/token client_credentials 200',
        'POST /v1/oauth/token refresh_token 200',
      ])
      expect(tokens.current.refreshToken).toEqual(mock.calls[0].res.data.refresh_token)
      expect(tokens.current.accessToken).toEqual(mock.calls[1].res.data.access_token)
      expect(seneca.export('BudProvider/stats')()).toMatchObject({
        refresh: 1, access: 1,
      })
    }

    await seneca.close()
  })


  test('requestTokens-access-fail', async () => {
    // Only the mock can make Bud reject the refresh token grant.
    if (null == mock) return

    for (const status of [401, 400]) {
      // After the failure, the next request waits for tokens: not for long.
      const seneca = await makeSeneca({ wait: { refresh: { max: 222, interval: 22 } } })
      const requestTokens = seneca.export('BudProvider/requestTokens')
      const { getTokenState, getToken } = seneca.export('BudProvider/util')

      // The access token grant fails: requestTokens rejects, as it does for
      // any other failed status, instead of resolving without tokens.
      mock.reject.refresh_token = status
      try {
        await expect(requestTokens()).rejects
          .toThrow('bud-provider: access-token: status:' + status)
      }
      finally {
        delete mock.reject.refresh_token
      }

      expect(mock.calls.map(callDesc)).toEqual([
        'POST /v1/oauth/token client_credentials 200',
        'POST /v1/oauth/token refresh_token ' + status,
      ])
      expect(getTokenState()).toEqual('start')
      expect(getToken('refresh')).toBeNull()
      expect(getToken('access')).toBeNull()

      // The next request still gets new tokens through the retry.
      mock.calls.length = 0
      const list = await seneca.entity("provider/bud/obp").list$()
      expect(list.map((obp) => obp.id)).toEqual(['Amex', 'Monzo'])
      expect(mock.calls.map(callDesc)).toEqual([
        'GET /v1/open-banking/providers 401',
        'POST /v1/oauth/token client_credentials 200',
        'POST /v1/oauth/token refresh_token 200',
        'GET /v1/open-banking/providers 200',
      ])
      expect(getTokenState()).toEqual('active')

      await seneca.close()
    }
  }, 11111)


  test('obp-list', async () => {
    const seneca = await makeSeneca({debug:true, print:{request:true}})

    // seneca.entity("provider/bud/obp").list$()
    const list = await seneca.entity("provider/bud/obp").list$()

    // console.log(list)

    await seneca.ready()
    
    expect(list.length > 0).toBeTruthy()

    if (mock) {
      expect(list.map((obp) => obp.id)).toEqual(['Amex', 'Monzo'])
      expect(list[1]).toMatchObject({
        entity$: 'provider/bud/obp',
        provider: 'Monzo',
        display_name: 'Monzo',
        regions: ['GBR'],
      })

      // The plugin has no token at first. Bud answers 401, and the retry
      // gets one: its loaded refresh token is empty, so a client
      // credentials grant follows.
      expect(mock.calls.map(callDesc)).toEqual([
        'GET /v1/open-banking/providers 401',
        'POST /v1/oauth/token refresh_token 401',
        'GET /v1/open-banking/providers 401',
        'POST /v1/oauth/token client_credentials 200',
        'POST /v1/oauth/token refresh_token 200',
        'GET /v1/open-banking/providers 200',
      ])
      expect(seneca.export('BudProvider/stats')()).toMatchObject({
        refresh: 1, access: 2, loadrefresh: 1, loadaccess: 0,
        req: 1, res: 1, error: 0, notfound: 0,
      })
    }

    await seneca.close()
  },11111)



  test('token-refresh', async () => {
    const seneca = await makeSeneca({debug:true,print:{request:true}})
    const stats = seneca.export('BudProvider/stats')

    let list = await seneca.entity("provider/bud/obp").list$()
    expect(list.length > 0).toBeTruthy()
    console.log('LIST LEN A', list.length)
    
    const budutil = seneca.export('BudProvider/util')
    const { setToken } = budutil
    setToken('access','bad')
    
    if (mock) {
      mock.calls.length = 0
    }

    list = await seneca.entity("provider/bud/obp").list$()
    expect(list.length > 0).toBeTruthy()
    console.log('LIST LEN B', list.length)

    if (mock) {
      // A bad access token: a new one from the refresh token.
      expect(mock.calls.map(callDesc)).toEqual([
        'GET /v1/open-banking/providers 401',
        'POST /v1/oauth/token refresh_token 200',
        'GET /v1/open-banking/providers 200',
      ])
      expect(stats()).toMatchObject({ refresh: 1, access: 3 })
      mock.calls.length = 0
    }

    setToken('refresh','bad')
    setToken('access','bad')

    list = await seneca.entity("provider/bud/obp").list$()
    expect(list.length > 0).toBeTruthy()
    console.log('LIST LEN C', list.length)

    if (mock) {
      // Both tokens bad: the refresh token grant fails, so a client
      // credentials grant gets a new refresh token.
      expect(mock.calls.map(callDesc)).toEqual([
        'GET /v1/open-banking/providers 401',
        'POST /v1/oauth/token refresh_token 401',
        'GET /v1/open-banking/providers 401',
        'POST /v1/oauth/token client_credentials 200',
        'POST /v1/oauth/token refresh_token 200',
        'GET /v1/open-banking/providers 200',
      ])
      expect(stats()).toMatchObject({
        refresh: 2, access: 5, req: 3, res: 3, error: 0,
      })
    }

    await seneca.close()
  }, 11111)


  /*
  //  NOTE: needs connect customerid
  // NOTE: only works on sandbox as needs connected account
  test('txdown', async () => {
    if (null == Config) return;

    const seneca = await makeSeneca({print:{request:true}})

    const budutil = seneca.export('BudProvider/util')
    const { setToken } = budutil

    const keymap = (await seneca.post('sys:provider,get:keymap,provider:bud')).keymap

    const tq = {
      customerid: keymap.test_custid.value,
      customersecret: keymap.test_custsecret.value,
      page_size: 200,
      account_id:  keymap.test_account.value,
    }

    console.log(tq)
    
    let list = await seneca.entity("provider/bud/transaction").list$(tq)
    console.log('FIRST', list.length, tq)
    // expect(list.length > 0).toBeTruthy()

    list = await seneca.entity("provider/bud/transaction").list$(tq)
    console.log('SECOND', list.length)


    await new Promise((r)=>{
      seneca.make("provider/bud/transaction").list$(tq, function(err, out) {
        console.log('RES0', err, list?.length)

        setToken('access','force-fail')
        
        setTimeout(()=>{
          this.make("provider/bud/transaction").list$(tq, function(err, out) {
            console.log('RES1', err, list?.length)

            setTimeout(()=>{
              this.make("provider/bud/transaction").list$(tq, function(err, out) {
                console.log('RES2', err, list?.length)
                r()
              })
            },111)
          })
        },111)
      })
    })

    console.log('STATS', seneca.export('BudProvider/stats')())
    
  }, 11111)



  // NOTE: only works on sandbox as needs connected account
  test('persist', async () => {
    if (null == Config) return;
    
    const tokenStore = {}
    
    const seneca = await makeSeneca({
      store: {
        saveToken: async (kind,val) =>{
          await new Promise((r)=>setTimeout(r,111))
          tokenStore[kind] = val
        },
        loadToken: async (kind) =>{
          await new Promise((r)=>setTimeout(r,111))
          return tokenStore[kind]
        }
      }
    })

    const budutil = seneca.export('BudProvider/util')
    const { setToken } = budutil

    const keymap = (await seneca.post('sys:provider,get:keymap,provider:bud')).keymap

    const tq = {
      customerid: keymap.test_custid.value,
      customersecret: keymap.test_custsecret.value,
      page_size: 200,
      account_id:  keymap.test_account.value,
    }

    console.log(tq)
    const stats = seneca.export('BudProvider/stats')
    
    let list = await seneca.entity("provider/bud/transaction").list$(tq)
    console.log('FIRST', list.length, tq, tokenStore, stats())
    expect(list.length > 0).toBeTruthy()
    expect(stats()).toMatchObject({
      refresh:1,access:2,loadrefresh:1,loadaccess:0,
    })


    list = await seneca.entity("provider/bud/transaction").list$(tq)
    console.log('SECOND', list.length, tokenStore)
    expect(list.length > 0).toBeTruthy()
    expect(stats()).toMatchObject({
      refresh:1,access:2,loadrefresh:1,loadaccess:0,
    })


    setToken('access','force-fail')
    
    list = await seneca.entity("provider/bud/transaction").list$(tq)
    console.log('THIRD', list.length, tokenStore)
    expect(list.length > 0).toBeTruthy()
    expect(stats()).toMatchObject({
      refresh:1,access:2,loadrefresh:1,loadaccess:1,
    })


      
    setToken('access','force-fail')
    tokenStore.access = 'store-fail'
    
    list = await seneca.entity("provider/bud/transaction").list$(tq)
    console.log('FOURTH', list.length, tokenStore,stats())
    expect(list.length > 0).toBeTruthy()
    expect(stats()).toMatchObject({
      refresh:1,access:3,loadrefresh:1,loadaccess:2,
    })

    
    setToken('refresh','force-fail')
    tokenStore.refresh = 'store-fail-bad'
    setToken('access','force-fail')
    tokenStore.access = 'store-fail-bad'
    
    list = await seneca.entity("provider/bud/transaction").list$(tq)
    console.log('FIFTH', list.length, tokenStore, stats())
    expect(stats()).toMatchObject({
      refresh:2,access:5,loadrefresh:1,loadaccess:3,
    })
    
    console.log('PERSIST STATS', seneca.export('BudProvider/stats')())

    const loadTokens = seneca.export('BudProvider/loadTokens')
    console.log('loadTokens', await loadTokens())
    
  }, 22222)
  */
  
  
  test('maintain', async () => {
    const exclude = []

    // check_default proves the default branch is main by looking for
    // [branch "main"] in .git/config. Only a branch checkout records that
    // section: a pull_request build checks out the merge ref, and the
    // publish build checks out a tag as a detached HEAD. Neither says
    // anything about what the default branch is, so skip rather than fail.
    if ('pull_request' === process.env.GITHUB_EVENT_NAME ||
      'tag' === process.env.GITHUB_REF_TYPE) {
      exclude.push('check_default')
    }

    // url_pkgjson locates package.json by comparing process.cwd() + '/package.json'
    // against a path found with Filehound. On Windows those are the same file
    // spelt with different separators, so the url is never read.
    if ('win32' === process.platform) {
      exclude.push('url_pkgjson')
    }

    await Maintain({ exclude })
  })
})

async function makeSeneca(budopts) {
  // Never fall back to the Bud API without credentials.
  if (!LIVE && null == mock) {
    throw new Error('bud-provider test: the mock Bud API is not running')
  }

  const seneca =Seneca({ legacy: false })
        .test()
        .use('@seneca/entity')
        .use('@seneca/env', {
          // debug: true,
          file: [__dirname + '/local-env.js;?'],
          var: {
            BUD_CLIENTID: String,
            $BUD_CLIENTSECRET: String,

            // NOT USED IN PRODUCTION
            // Only the sandbox tests txdown and persist, which are commented
            // out, use these, so they default to empty.
            BUD_TEST_CUSTID: '',
            BUD_TEST_CUSTSECRET: '',
            BUD_TEST_ACCOUNT: '',
          },
        })
        .use('@seneca/provider', {
          provider: {
            bud: {
              keys: {
                clientid: { value: '$BUD_CLIENTID' },
                clientsecret: { value: '$BUD_CLIENTSECRET' },

                // NOT USED IN PRODUCTION
                test_custid: { value: '$BUD_TEST_CUSTID' },
                test_custsecret: { value: '$BUD_TEST_CUSTSECRET' },
                test_account: { value: '$BUD_TEST_ACCOUNT' },
              },
            },
          },
        })

  /*
      .use('evervault-provider', {
        config: {
          
          decryptionDomains: [
            'api-sandbox.thisisbud.com',
            'api.thisisbud.com',
          ],
          debugRequests: true
        }
      })
*/
  
        .use(BudProvider,{
          debug: false,
          url: mock ? mock.url : 'https://api-sandbox.thisisbud.com/',
          // url: 'https://api.thisisbud.com/',
          entity: {
            customer: {
              save: {
                host_secret: false
              }
            }
          },
          ...(budopts||{}),
        })

  await seneca.ready()

  if (mock) {
    mock.calls.length = 0
  }

  return seneca
}


function callDesc(call) {
  return [call.method, call.path, call.grant, call.status]
    .filter((part) => null != part).join(' ')
}


// A local stand-in for the Bud API calls that the tests make, shaped like
// Bud's public API documentation (docs.thisisbud.com: Authentication, Error
// responses, and Retrieve Bank Providers):
//
//   POST /v1/oauth/token  grant_type=client_credentials, with HTTP Basic
//     authentication by the client id and secret; grant_type=refresh_token
//     with refresh_token and the X-Client-Id header. Both answer
//     { operation_id, data: { access_token, token_type, expires_in,
//     refresh_token } }.
//   GET /v1/open-banking/providers  with a Bearer access token and
//     X-Client-Id. Answers { operation_id, data: [provider...], metadata }.
//
// A missing or unknown token gets 401 with Bud's error body
// { operation_id, code_id, message }. Issued refresh tokens stay valid.
// Each request is recorded in calls. A test can set reject[grant_type] to
// 401 or 400 to make that grant fail.
async function makeMockBudApi(spec) {
  const calls = []
  const reject = {}
  const refreshTokens = new Set()
  const accessTokens = new Set()
  let tokenCount = 0

  const basic = 'Basic ' +
    Buffer.from(spec.clientid + ':' + spec.clientsecret).toString('base64')

  const providers = [
    {
      provider: 'Amex',
      regions: ['GBR', 'FRA'],
      display_name: 'American Express',
      icon: 'https://assets.thisisbud.com/openbanking/amex-logo.png',
      maintenance_window: null,
      maintenance_status: 'inactive',
    },
    {
      provider: 'Monzo',
      regions: ['GBR'],
      display_name: 'Monzo',
      icon: 'https://assets.thisisbud.com/logos/Monzo/v1/Monzo@3x.png',
      maintenance_window: null,
      maintenance_status: 'inactive',
    },
  ]

  function issueTokens() {
    tokenCount++
    const refresh_token = 'mock-refresh-' + tokenCount
    const access_token = 'mock-access-' + tokenCount
    refreshTokens.add(refresh_token)
    accessTokens.add(access_token)
    return {
      access_token,
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token,
    }
  }

  function unauthorized(code_id) {
    return [401, {
      operation_id: 'unknown',
      code_id,
      message: 'token_invalid' === code_id ?
        'An invalid token was provided.' : 'Unauthorised request',
    }]
  }

  function invalid() {
    return [400, {
      operation_id: 'oauth_token_post',
      code_id: 'failed_validation',
      message: 'Invalid request payload.',
      metadata: {},
      errors: { grant_type: 'This value is invalid.' },
    }]
  }

  function token(req, body) {
    const params = new URLSearchParams(body)
    const grant = params.get('grant_type')

    if (401 === reject[grant]) {
      return [grant, unauthorized('token_invalid')]
    }
    if (400 === reject[grant]) {
      return [grant, invalid()]
    }

    if ('client_credentials' === grant) {
      if (basic !== req.headers.authorization) {
        return [grant, unauthorized('unknown')]
      }
      return [grant, [200, { operation_id: 'oauth_token_post', data: issueTokens() }]]
    }

    if ('refresh_token' === grant) {
      if (spec.clientid !== req.headers['x-client-id'] ||
        !refreshTokens.has(params.get('refresh_token'))) {
        return [grant, unauthorized('token_invalid')]
      }
      return [grant, [200, { operation_id: 'oauth_token_post', data: issueTokens() }]]
    }

    return [grant, invalid()]
  }

  function listProviders(req) {
    const auth = req.headers.authorization || ''
    if (!auth.startsWith('Bearer ')) {
      return unauthorized('unknown')
    }
    if (spec.clientid !== req.headers['x-client-id'] ||
      !accessTokens.has(auth.substring(7))) {
      return unauthorized('token_invalid')
    }
    return [200, {
      operation_id: 'open_banking_providers_get',
      data: providers,
      metadata: null,
    }]
  }

  const server = Http.createServer((req, res) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      const path = new URL(req.url, 'http://localhost').pathname
      let grant = undefined
      let out

      if ('POST' === req.method && '/v1/oauth/token' === path) {
        [grant, out] = token(req, body)
      }
      else if ('GET' === req.method && '/v1/open-banking/providers' === path) {
        out = listProviders(req)
      }
      else {
        out = [404, {
          operation_id: 'unknown',
          code_id: 'not_found',
          message: 'Not found.',
        }]
      }

      const [status, json] = out
      calls.push({ method: req.method, path, grant, status, res: json })
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(json))
    })
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

  return {
    // NOTE: include trailing /, as the url option of the plugin does.
    url: 'http://127.0.0.1:' + server.address().port + '/',
    calls,
    reject,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}
