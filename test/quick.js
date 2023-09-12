const Bud = require('bud-api')
const token = require('./local-env').BUD_ACCESSTOKEN

run()

async function run() {
  // initialize the client with the access token
  const bud = new Bud({ token })

  const col = await bud.collection({
    collectionId: '',
  })
  const colItems = await col.items()
  console.log(colItems)
}
