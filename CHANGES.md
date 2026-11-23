# Changes

## 2.0.0 2026-11-22

First entry of this change log. Earlier versions are on npm and in the git
history. This release contains the token load and save work of 0.7.0 to
1.0.0, which were published from the branch `load-save-tokens`; that branch
is now merged.

* Seneca 4: the peer dependency is `seneca` `^4.0.0` (was `>=3`). Seneca 3
  users stay on `@seneca/bud-provider@1`.
* The entity peer is `@seneca/entity` `^29.0.0` instead of `seneca-entity`.
  The other peers are `@seneca/provider` `^5.0.0` and `@seneca/env`
  `^0.6.0`, which is now optional: the plugin itself does not use it.
* The `seneca-promisify` peer dependency is removed. Seneca 4 has promises
  built in; do not call `use('promisify')` (D4).
* Node.js 24 or later (`engines.node` `>=24`, was `>=16`).
* The request shapes use Seneca's validator, `seneca.valid`, instead of the
  deprecated `seneca.util.Gubu` (D2).
* The option `retry.config` is passed through to fetch-retry, so it stays
  open on Seneca 4 and accepts any fetch-retry setting, such as `retries`
  (B13).
* The exported `requestTokens()` rejects with the error
  `bud-provider: access-token: status:<status>` when Bud answers the access
  token request with 401 or 400. It used to resolve to `true`, without
  tokens.
* Tests load plugins by full name (`@seneca/entity`, `@seneca/env`,
  `@seneca/provider`) and no longer load `user`. Without credentials the
  `requestTokens`, `obp-list` and `token-refresh` tests run against a local
  mock of the Bud API, with dummy client keys; with `test/local-config.js`,
  or the environment variables `BUD_CLIENTID` and `BUD_CLIENTSECRET`, they
  call the Bud sandbox. `BUD_TEST_CUSTID`, `BUD_TEST_CUSTSECRET` and
  `BUD_TEST_ACCOUNT` now default to empty. Live calls were not tested on
  Seneca 4.
* The `maintain` test skips `check_default` in a pull request or tag build
  and `url_pkgjson` on Windows.
* devDependencies: `seneca` `^4.0.0`, `@seneca/entity` `^29.0.0`,
  `@seneca/env` `^0.6.0`, `@seneca/provider` `^5.0.0`, `@seneca/doc`
  `^9.0.0`, `@seneca/evervault-provider` `^1.0.0` and `seneca-msg-test`
  `^5.0.0`. Removed `@seneca/user`, which the plugin does not use.
* README: Seneca 4 install line.
* `repository.url` uses `git+https`, `publishConfig` sets public access, and
  the package includes `CHANGES.md`.
