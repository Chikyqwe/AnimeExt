const {extractAllVideoLinks, getExtractor} = require("./extractors")

let test = async () => {
    let links = await extractAllVideoLinks("https://www3.animeflv.net/ver/isekai-nonbiri-nouka-1");
    let extractor = getExtractor("sw");
    console.log(links);
    console.log(extractor);
}

test()

