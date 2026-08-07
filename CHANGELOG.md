# v8.3.2 (Fri Aug 7 2026)

#### Bug Fix

- Fix overlapping multiline virtual rows during frequent data refreshes by remeasuring recycled DOM slots against their current node paths.

#### Testing

- Add a high-frequency regression covering recycled rows that alternate between short and long multiline strings.

# v8.3.1 (Mon Jul 20 2026)

#### 🐛 Bug Fix

- fix: recycle tree row DOM by keying on virtual index ([@BranZhang](https://github.com/BranZhang))

#### 🏠 Internal

- build: build and test on prepublishOnly ([@BranZhang](https://github.com/BranZhang))

#### Authors: 1

- [@BranZhang](https://github.com/BranZhang)
