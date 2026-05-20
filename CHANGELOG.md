# [1.15.0](https://github.com/eresearchqut/ddb-repository/compare/v1.14.0...v1.15.0) (2026-05-20)


### Features

* migrate from Jest to Vitest and cleanup redundant dependencies ([d9913e6](https://github.com/eresearchqut/ddb-repository/commit/d9913e6919564931bab96c8bcdc925c490dee4b8))

# [1.14.0](https://github.com/eresearchqut/ddb-repository/compare/v1.13.5...v1.14.0) (2026-05-20)


### Features

* migrate from Jest to Vitest and cleanup redundant dependencies ([46be998](https://github.com/eresearchqut/ddb-repository/commit/46be998bd78e05fb279ee0684f2f3758416260e5))

## [1.13.5](https://github.com/eresearchqut/ddb-repository/compare/v1.13.4...v1.13.5) (2026-05-19)


### Bug Fixes

* update dependencies in package.json and package-lock.json ([211b602](https://github.com/eresearchqut/ddb-repository/commit/211b60289614b670b60060e9aa78fb5b7a67fa4f))

## [1.13.4](https://github.com/eresearchqut/ddb-repository/compare/v1.13.3...v1.13.4) (2026-05-19)


### Bug Fixes

* strip .npmrc scope routing before publishing to npmjs.com ([273f15d](https://github.com/eresearchqut/ddb-repository/commit/273f15dfa1f3d60831e8e0ecb0bc05af178605e8))

## [1.13.3](https://github.com/eresearchqut/ddb-repository/compare/v1.13.2...v1.13.3) (2026-05-19)


### Bug Fixes

* decouple npm publishing from semantic-release to use OIDC ([8e18c8d](https://github.com/eresearchqut/ddb-repository/commit/8e18c8d46a6c35fb17a95994dafcbf860b63a355))
* publish to both npmjs.com and GitHub Packages ([d28b45d](https://github.com/eresearchqut/ddb-repository/commit/d28b45d4d31607877501c8d40ad871a2bf230d54))

## [1.13.2](https://github.com/eresearchqut/ddb-repository/compare/v1.13.1...v1.13.2) (2026-05-18)


### Reverts

* Revert "fix: use NPM_TOKEN secret for npm publishing in release workflow" ([8c3c783](https://github.com/eresearchqut/ddb-repository/commit/8c3c783da15c37ef63f11462fcb7d849339db2bc))

## [1.13.1](https://github.com/eresearchqut/ddb-repository/compare/v1.13.0...v1.13.1) (2026-05-18)


### Bug Fixes

* use NPM_TOKEN secret for npm publishing in release workflow ([132085f](https://github.com/eresearchqut/ddb-repository/commit/132085f2131da0ba6473c8cff8f5c5ba41228301))

# [1.13.0](https://github.com/eresearchqut/ddb-repository/compare/v1.12.1...v1.13.0) (2026-05-18)


### Features

* add patchDocument to JsonPointerRepository ([80cbdeb](https://github.com/eresearchqut/ddb-repository/commit/80cbdebbce5f985388f63708eb140b4ed27f7965))

## [1.12.1](https://github.com/eresearchqut/ddb-repository/compare/v1.12.0...v1.12.1) (2026-05-18)


### Bug Fixes

* correct test assertions for getItemsPage pagination ([2d94ca8](https://github.com/eresearchqut/ddb-repository/commit/2d94ca8d538f41271677dbbc0aaa30ebfaf1d961))

# [1.12.0](https://github.com/eresearchqut/ddb-repository/compare/v1.11.0...v1.12.0) (2026-05-18)


### Features

* add getItemsPage for cursor-based pagination ([6f6ba9e](https://github.com/eresearchqut/ddb-repository/commit/6f6ba9e25e06d4440b11e0839414feb8fd2c47da))

# [1.11.0](https://github.com/eresearchqut/ddb-repository/compare/v1.10.1...v1.11.0) (2026-05-18)


### Features

* add batchWriteItems with recursive retry and fix filter function casing ([1beb5bc](https://github.com/eresearchqut/ddb-repository/commit/1beb5bc70452943725fe414a79fac19317b8e132))

## [1.10.1](https://github.com/eresearchqut/ddb-repository/compare/v1.10.0...v1.10.1) (2026-05-18)


### Bug Fixes

* standardize enum casing for consistency in DynamoDbRepository ([bfb7948](https://github.com/eresearchqut/ddb-repository/commit/bfb7948458b99b1004ff5c66a75fe2bef7ca35ab))

# [1.10.0](https://github.com/eresearchqut/ddb-repository/compare/v1.9.9...v1.10.0) (2026-05-18)


### Features

* add BEGINS_WITH and CONTAINS filter operators ([cc4c0e1](https://github.com/eresearchqut/ddb-repository/commit/cc4c0e1cb81db9fe6fc1fcb1c0888b8443fb2f5f)), closes [#attr](https://github.com/eresearchqut/ddb-repository/issues/attr) [#attr](https://github.com/eresearchqut/ddb-repository/issues/attr)

## [1.9.9](https://github.com/eresearchqut/ddb-repository/compare/v1.9.8...v1.9.9) (2026-05-18)


### Bug Fixes

* remove duplicate closing brace from test file ([8ee784d](https://github.com/eresearchqut/ddb-repository/commit/8ee784d0542e8d3548395cadae5cda284d06585c)), closes [#27](https://github.com/eresearchqut/ddb-repository/issues/27)

## [1.9.8](https://github.com/eresearchqut/ddb-repository/compare/v1.9.7...v1.9.8) (2026-05-18)


### Performance Improvements

* add key-only ProjectionExpression to GSI query in getItems ([ea54b8a](https://github.com/eresearchqut/ddb-repository/commit/ea54b8a8f273ab46a5af295d1d9d9606e26d759c))

## [1.9.7](https://github.com/eresearchqut/ddb-repository/compare/v1.9.6...v1.9.7) (2026-05-18)


### Bug Fixes

* treat all-undefined updates as no-op in updateItem ([4b4c561](https://github.com/eresearchqut/ddb-repository/commit/4b4c5614610835358d4ff6bd7a758108d6ee3f69))

## [1.9.6](https://github.com/eresearchqut/ddb-repository/compare/v1.9.5...v1.9.6) (2026-05-18)


### Bug Fixes

* return deleted item from deleteItem via ReturnValues ALL_OLD ([a9a48ce](https://github.com/eresearchqut/ddb-repository/commit/a9a48ce7cbf1ad8ae1c0bc86177c7db44933e687))

## [1.9.5](https://github.com/eresearchqut/ddb-repository/compare/v1.9.4...v1.9.5) (2026-05-18)


### Performance Improvements

* use ReturnValues ALL_NEW in updateItem to eliminate extra GetItem call ([6e2d37b](https://github.com/eresearchqut/ddb-repository/commit/6e2d37bc851beefc43c2202fbf2baf91b329896a))

## [1.9.4](https://github.com/eresearchqut/ddb-repository/compare/v1.9.3...v1.9.4) (2026-05-18)


### Performance Improvements

* eliminate redundant GetItem call in putItem by unmarshalling the item directly ([b8218db](https://github.com/eresearchqut/ddb-repository/commit/b8218dbef0641fe4d7cc507a7baa16f3ce279a43))

## [1.9.3](https://github.com/eresearchqut/ddb-repository/compare/v1.9.2...v1.9.3) (2026-05-18)


### Bug Fixes

* preserve GSI query order after batchGetItems in getItems ([f8e07c8](https://github.com/eresearchqut/ddb-repository/commit/f8e07c8981d113d8aa991a8e41b63dad7204bb2d)), closes [#37](https://github.com/eresearchqut/ddb-repository/issues/37)

## [1.9.2](https://github.com/eresearchqut/ddb-repository/compare/v1.9.1...v1.9.2) (2026-04-27)


### Bug Fixes

* treat empty remove array as no-op in updateItem ([964de84](https://github.com/eresearchqut/ddb-repository/commit/964de844642b383f2e14cb8604c5b56bb998b44d))

## [1.9.1](https://github.com/eresearchqut/ddb-repository/compare/v1.9.0...v1.9.1) (2026-04-27)


### Performance Improvements

* stop paginating getItems once limit is reached ([c0d9ef8](https://github.com/eresearchqut/ddb-repository/commit/c0d9ef8c8180ac6c89172e383982d4d47b35e488))

# [1.9.0](https://github.com/eresearchqut/ddb-repository/compare/v1.8.6...v1.9.0) (2026-04-27)


### Bug Fixes

* address Copilot review feedback on JsonPointerRepository ([3d8c64a](https://github.com/eresearchqut/ddb-repository/commit/3d8c64a286ffccb0712321f965128f3d9a85d80d))


### Features

* implement `JsonPointerRepository` with DynamoDB support and integration tests ([48247b2](https://github.com/eresearchqut/ddb-repository/commit/48247b20b45211b945b3202800f838ca30e3c8e5))

## [1.8.6](https://github.com/eresearchqut/ddb-repository/compare/v1.8.5...v1.8.6) (2026-04-26)


### Bug Fixes

* correct TypeScript module resolution for bundler project ([4c4d1e1](https://github.com/eresearchqut/ddb-repository/commit/4c4d1e10079c605f0bba22b50330fa5d9464f127))

## [1.8.5](https://github.com/eresearchqut/ddb-repository/compare/v1.8.4...v1.8.5) (2026-04-26)


### Bug Fixes

* add removeUndefinedValues to marshall calls in updateItem and batchGetItems ([4f401e9](https://github.com/eresearchqut/ddb-repository/commit/4f401e9dd186b60a3db81e1bbc9ff5fd6e1ead8d))
* apply expressionAttributeKey to IN filter value placeholders ([4ba199c](https://github.com/eresearchqut/ddb-repository/commit/4ba199c4e28c2de07932a3c7496ac1706a8d4083))
* correct ExpressionAttributeNames for hyphenated attributes in updateItem remove ([04c88f0](https://github.com/eresearchqut/ddb-repository/commit/04c88f02211b57519dc2d81c1645f4942aa71104)), closes [#my_attr](https://github.com/eresearchqut/ddb-repository/issues/my_attr)
* retry UnprocessedKeys in batchGetItems with exponential backoff ([23f98ed](https://github.com/eresearchqut/ddb-repository/commit/23f98ed29281835951e8c2c6c92853710fba075d))

## [1.8.4](https://github.com/eresearchqut/ddb-repository/compare/v1.8.3...v1.8.4) (2026-04-24)


### Bug Fixes

* add ReturnConsumedCapacity and removeUndefinedValues to deleteItem ([20e9231](https://github.com/eresearchqut/ddb-repository/commit/20e9231daa8b75f62635cb3427c70c430b7fda4c))
* resolve TypeScript type error in consumedCapacityMiddleware ([c509ebb](https://github.com/eresearchqut/ddb-repository/commit/c509ebbe11a00602dacbd6262ad85d740ef663bd))

## [1.8.3](https://github.com/eresearchqut/ddb-repository/compare/v1.8.2...v1.8.3) (2026-04-24)


### Bug Fixes

* replace explicit any types in consumedCapacityMiddleware ([5e50f96](https://github.com/eresearchqut/ddb-repository/commit/5e50f969bb3701eaa506b11d0e6bb754ecbe3e0d))

## [1.8.2](https://github.com/eresearchqut/ddb-repository/compare/v1.8.1...v1.8.2) (2026-02-19)


### Bug Fixes

* Reverting package type ([e5ff896](https://github.com/eresearchqut/ddb-repository/commit/e5ff896377c06f8a9022bbd79a3b706dd876f515))

## [1.8.1](https://github.com/eresearchqut/ddb-repository/compare/v1.8.0...v1.8.1) (2026-02-19)


### Bug Fixes

* Reverting package type ([e769577](https://github.com/eresearchqut/ddb-repository/commit/e7695775878060a070143c3d254264c1e4f4b600))

# [1.8.0](https://github.com/eresearchqut/ddb-repository/compare/v1.7.1...v1.8.0) (2026-02-19)


### Features

* Moving packaging from tsup -> tsdown, type cleanup ([1d9afd6](https://github.com/eresearchqut/ddb-repository/commit/1d9afd60bd11a5549e578f41d67e06c53839653f))

## [1.7.1](https://github.com/eresearchqut/ddb-repository/compare/v1.7.0...v1.7.1) (2026-01-28)


### Bug Fixes

* Export DynamoDbRepositoryOptions interface ([94c5ecf](https://github.com/eresearchqut/ddb-repository/commit/94c5ecf2b75f40d615442b0a11cc2f4bff427947))

# [1.7.0](https://github.com/eresearchqut/ddb-repository/compare/v1.6.0...v1.7.0) (2025-12-22)


### Features

* Client version ([73c5a28](https://github.com/eresearchqut/ddb-repository/commit/73c5a28378afa52be4baf3a1cfb6e73c73f9a654))

# [1.6.0](https://github.com/eresearchqut/ddb-repository/compare/v1.5.11...v1.6.0) (2025-12-18)


### Features

* Query with limit and sort order ([d224d61](https://github.com/eresearchqut/ddb-repository/commit/d224d6188bec1aa62977781a933b020fe5a59b4a))

## [1.5.11](https://github.com/eresearchqut/ddb-repository/compare/v1.5.10...v1.5.11) (2025-12-18)


### Bug Fixes

* MJS and CJS exports ([4f4b3fa](https://github.com/eresearchqut/ddb-repository/commit/4f4b3fa049afcf2e5c9f19aff5568ef19c91b600))

## [1.5.10](https://github.com/eresearchqut/ddb-repository/compare/v1.5.9...v1.5.10) (2025-12-11)


### Bug Fixes

* Publish to github ([a4b98a8](https://github.com/eresearchqut/ddb-repository/commit/a4b98a858aa78250a9d2fcb54c01dd1d3dceaf69))

## [1.5.9](https://github.com/eresearchqut/ddb-repository/compare/v1.5.8...v1.5.9) (2025-12-11)


### Bug Fixes

* Publish to github ([002ad77](https://github.com/eresearchqut/ddb-repository/commit/002ad775ccb91819f5b5c5cd5638773823fa4669))
* Publish to github ([6f91c4f](https://github.com/eresearchqut/ddb-repository/commit/6f91c4f20951d7e2db3c32ab7b3cea1de509dbfc))

## [1.5.8](https://github.com/eresearchqut/ddb-repository/compare/v1.5.7...v1.5.8) (2025-12-11)


### Bug Fixes

* Publish to npm ([18388e0](https://github.com/eresearchqut/ddb-repository/commit/18388e0694cd7e14bdec699446bde15177de0b12))

## [1.5.7](https://github.com/eresearchqut/ddb-repository/compare/v1.5.6...v1.5.7) (2025-12-11)


### Bug Fixes

* Publish to github ([e08ecfc](https://github.com/eresearchqut/ddb-repository/commit/e08ecfcf6bd01561ceb22191d7a264b630c0da95))
* Publish to npm ([15dea85](https://github.com/eresearchqut/ddb-repository/commit/15dea854f65a00cbffd44e3984a96e8462c7c128))

## [1.5.6](https://github.com/eresearchqut/ddb-repository/compare/v1.5.5...v1.5.6) (2025-12-11)


### Bug Fixes

* Adding NPM Publish ([6112d68](https://github.com/eresearchqut/ddb-repository/commit/6112d680e693114315ebfe63b6f542760098c76d))

## [1.5.5](https://github.com/eresearchqut/ddb-repository/compare/v1.5.4...v1.5.5) (2025-12-11)


### Bug Fixes

* Adding NPM Publish ([8246366](https://github.com/eresearchqut/ddb-repository/commit/824636610a803b8a0bc07f4b1227f9ddde997de7))

## [1.5.4](https://github.com/eresearchqut/ddb-repository/compare/v1.5.3...v1.5.4) (2025-12-11)


### Bug Fixes

* adding build to release action ([a396d9f](https://github.com/eresearchqut/ddb-repository/commit/a396d9f507ec7da3ebac7664f1d0641f8897280d))

## [1.5.3](https://github.com/eresearchqut/ddb-repository/compare/v1.5.2...v1.5.3) (2025-12-10)


### Bug Fixes

* adding repository to package.json ([94961d2](https://github.com/eresearchqut/ddb-repository/commit/94961d22bd371742b4ed4309cfe118e95ea09958))

## [1.5.2](https://github.com/eresearchqut/ddb-repository/compare/v1.5.1...v1.5.2) (2025-12-10)


### Bug Fixes

* release to npm ([274ef77](https://github.com/eresearchqut/ddb-repository/commit/274ef77b079d644571066e5c05a9edf3e4cf7396))

## [1.5.1](https://github.com/eresearchqut/ddb-repository/compare/v1.5.0...v1.5.1) (2025-12-10)


### Bug Fixes

* Module type ([52a2a07](https://github.com/eresearchqut/ddb-repository/commit/52a2a07295bafcfa8b621fd59d085d7dfd567402))
* package updates ([79d5672](https://github.com/eresearchqut/ddb-repository/commit/79d56725628a6ea0216b86a5c2d8f158fc008de6))
* Updated installation instructions ([282e1fd](https://github.com/eresearchqut/ddb-repository/commit/282e1fd0d6ffe24a3caefa5e2c1e7067a348a3ce))

# [1.5.0](https://github.com/eresearchqut/ddb-repository/compare/v1.4.1...v1.5.0) (2025-11-21)


### Features

* Initialise the repository using options ([e3a2f46](https://github.com/eresearchqut/ddb-repository/commit/e3a2f46d3a8fb0ca467409369eef505d0451b6b0))

## [1.4.1](https://github.com/eresearchqut/ddb-repository/compare/v1.4.0...v1.4.1) (2025-11-21)


### Bug Fixes

* Fix scope of internal methods ([c652753](https://github.com/eresearchqut/ddb-repository/commit/c652753156662fa08b818e0df068fbb2702881c9))

# [1.4.0](https://github.com/eresearchqut/ddb-repository/compare/v1.3.0...v1.4.0) (2025-11-20)


### Features

* Add test for the tracking of the consumed capacity and rename test class ([d113a5a](https://github.com/eresearchqut/ddb-repository/commit/d113a5a948a7dffc80e9d3a65a11203c2249ed26))

# [1.3.0](https://github.com/eresearchqut/ddb-repository/compare/v1.2.0...v1.3.0) (2025-11-20)


### Features

* Add test for the tracking of the consumed capacity ([4a1b23c](https://github.com/eresearchqut/ddb-repository/commit/4a1b23cadadbbb02d78507ca9d34715219fc952c))

# [1.2.0](https://github.com/eresearchqut/ddb-repository/compare/v1.1.0...v1.2.0) (2025-11-19)


### Features

* return the consumed capacity for each operation ([3910953](https://github.com/eresearchqut/ddb-repository/commit/391095398381a950c3393f9103d97d355c119538))

# [1.1.0](https://github.com/eresearchqut/ddb-repository/compare/v1.0.2...v1.1.0) (2025-11-19)


### Features

* NPM Package Badge ([fecd958](https://github.com/eresearchqut/ddb-repository/commit/fecd958d0d3725e0fc19f43f36e00eb7e5437716))
