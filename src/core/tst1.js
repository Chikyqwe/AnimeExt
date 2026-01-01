const { extractAllVideoLinks, getExtractor } = require("./extractors");

let test = async () => {
    let links = await extractAllVideoLinks("https://www3.animeflv.net/ver/isekai-nonbiri-nouka-1");
    console.log(links);
    let extractor = getExtractor("voe");
    let videoData = await extractor('https://crystaltreatmenteast.com/e/gedd8u4zk5os'); // extraer del primer link
    console.log(videoData);
};

test();