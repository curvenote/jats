# jats-xml

## 0.1.0

### Minor Changes

- 8846ec9: Move to using jats-tags for types

### Patch Changes

- e5520ee: Trim CDATA strings, based on pandoc output
- Updated dependencies [8846ec9]
  - jats-tags@0.1.0

## 0.0.17

### Patch Changes

- Add the testing CLI to JATS:

`jats test article.xml --cases tests.yml`

## 0.0.16

### Patch Changes

- f066817: Support JATS authoring and publishing libraries, in addition to archiving
- f066817: Support JATS versions down to 1.1
- a85bab7: Infer JATS version from file content

## 0.0.15

### Patch Changes

- 7a28c41: Add validation command for DTD validation

## 0.0.13

### Patch Changes

- Use peer-dependencies for myst

## 0.0.10

### Patch Changes

- aed76d7: Less selective on unist-util-select dependency

## 0.0.9

### Patch Changes

- 9cde75c: Update packaging

## 0.0.8

### Patch Changes

- 3ea5c4a7: Improve the options for jats resolvers and fetchers to expose these externally.
- Updated dependencies [bfd72456]
- Updated dependencies [e7330dbb]
- Updated dependencies [0a87866d]
- Updated dependencies [6ebaffda]
  - myst-frontmatter@0.0.5
  - myst-common@0.0.11

## 0.0.7

### Patch Changes

- 69beba40: Update readme and documentation
- Updated dependencies [ececeab6]
  - myst-common@0.0.10

## 0.0.6

### Patch Changes

- Updated dependencies [4e27734b]
  - myst-common@0.0.9

## 0.0.5

### Patch Changes

- 566c9ffe: Improve download logic for JATS xml, by looking at the DOI json service.
- 11ff02b4: Update doi-utils to 1.0.9
- Updated dependencies [5403b5b5]
- Updated dependencies [11ff02b4]
  - myst-frontmatter@0.0.4
  - myst-common@0.0.8

## 0.0.4

### Patch Changes

- 19b59f85: Consume `jats-xml` in `myst-to-jats`
- Updated dependencies [97a888c0]
  - myst-common@0.0.7
