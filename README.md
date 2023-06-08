# jats-xml

[![jats-xml on npm](https://img.shields.io/npm/v/jats-xml.svg)](https://www.npmjs.com/package/jats-xml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/curvenote/jats-xml/blob/main/LICENSE)
[![CI](https://github.com/curvenote/jats-xml/workflows/CI/badge.svg)](https://github.com/curvenote/jats-xml/actions)

Types and utilities for working with JATS XML documents in Node and Typescript.

Read and write JATS XML from node or see summries from the command line.

To use from the command line, use the `-g` to create a global install, which will provide a `jats` CLI:

```
npm install -g jats-xml
jats -v
```

## What is JATS?

JATS is a NISO standard for Journal Article Tags Schema, which is a way to define the XML structure of a scientific article semantically. This includes the `front`-matter (authors, funding, title, abstract, etc.), the `body` of the article (sections, figures, equations, tables, etc.), and `back`-matter (references, footnotes, etc.). The JATS can also contain `sub-articles`.

The standard documents are hosted by the NIH <https://jats.nlm.nih.gov/>. There are three flavours, this library currently uses in most cases the most precriptive tag set (for article authoring). Another helpful resource is <https://jats4r.org/>, which provides other examples and recomendations for JATS.

Note that most publishers do **not** provide the XML as a first class output - they should, it is an important part of open-science to have the content programatically accessible and interoperable. It is only [FAIR](https://www.go-fair.org/fair-principles/) 😉.

## Packages

See packages folder:

- jats-xml
- jats-tags
