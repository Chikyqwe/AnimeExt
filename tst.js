import * as browserlessExtractors from './src/services/browserlessExtractors.js';

async function run() {
  const url = 'https://asnwish.com/e/z39u8hx17rjl';
  let extractor = browserlessExtractors.getExtractor('sw');
  let result = await extractor(url);
  console.log(result);
}

run();
