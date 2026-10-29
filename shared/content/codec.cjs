const { deflateRawSync, inflateRawSync } = require('node:zlib');
// Versioned, constant dictionary; never derived from private reading data.
const dictionary = Buffer.from('id revision title author dynasty genre text lines sourcePath sourceIndex upstreamId passages start end textHash source collection workId workTitle chapter section corpusVersion work packId poetry paragraphs poet.song. poet.tang. .json 作者不详 相思 唐 宋 诗 词 "id":"","source":"","collection":"poetry","workId":"","workTitle":"","chapter":"","section":1,"text":"","textHash":"","corpusVersion":"poetry:","work":{"packId":"poetry","workId":"","revision":"","start":0,"end":0,"title":"","author":"","dynasty":"","genre":""}');
const encode = value => deflateRawSync(Buffer.from(value), { dictionary });
const decode = value => inflateRawSync(value, { dictionary, maxOutputLength: 2 * 1024 * 1024 });
module.exports = { encode, decode, packJSON: value => encode(JSON.stringify(value)), unpackJSON: value => JSON.parse(decode(value).toString('utf8')) };
