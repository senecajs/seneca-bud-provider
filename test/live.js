const Seneca = require('seneca')

Seneca({ legacy: false })
  .test()
  .use('promisify')
  .use('entity')
  .use('env', {
    // debug: true,
    file: [__dirname + '/local-env.js;?'],
    var: {
      $BUD_ACCESSTOKEN: String,
    },
  })
  .use('provider', {
    provider: {
      bud: {
        keys: {
          accesstoken: { value: '$BUD_ACCESSTOKEN' },
        },
      },
    },
  })
  .use('../')
  .ready(async function () {
    const seneca = this

    console.log(await seneca.post('sys:provider,provider:bud,get:info'))

    const list = await seneca.entity('provider/bud/site').list$()
    console.log(list.slice(0, 3))
  })
