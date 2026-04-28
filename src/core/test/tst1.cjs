const { extractST } = require('../extractors/st.js');

(async () => {
    try {
        const result = await extractST('https://streamtape.com/e/DPaGPPBBpmTk0jA/');
        console.log(result);
    } catch (e) {
        console.log(e);
    }
})();
