const { axiosGet, UA_FIREFOX } = require('../helpersCore');
const cheerio = require('cheerio');

async function checkSTLink(data) {
    const testUrl = `https://streamtape.com/get_video` +
        `?id=${data.id_video}` +
        `&expires=${data.expires}` +
        `&ip=${data.ip}` +
        `&token=${data.token}`;

    try {
        // Hacemos la petición HEAD para comprobar
        const res = await axiosGet(testUrl, {
            method: 'HEAD',
            headers: {
                'User-Agent': UA_FIREFOX,
                'Referer': 'https://streamtape.com/'
            },
            timeout: 6000,
            maxRedirects: 0, // importante para capturar la redirección
            validateStatus: () => true // no lanzar excepción por status
        });

        // Descarta respuestas con JSON de error
        const contentType = res.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
            console.log('500-403')
            return null; // Esto era un error {"status":500,...} o {"status":403,...}
        }

        // Solo aceptamos redirección con Location
        if ([301, 302, 303, 307, 308].includes(res.status || res.statusCode)) {
            const location = res.headers['location'];
            if (location) return location; // Este es el link real al video
        }

    } catch (e) {
        // ignoramos errores
        return null;
    }

    return null; // ningún link válido
}


async function extractST(pageUrl) {
    console.log('[ST]: Extrayendo desde: ' + pageUrl);

    try {
        const { data: html } = await axiosGet(pageUrl, {
            headers: { 'User-Agent': UA_FIREFOX },
            timeout: 8000
        });

        const $ = cheerio.load(html);

        const scriptElems = $('script').toArray();
        for (const el of scriptElems) {
            const scriptContent = $(el).html();
            if (!scriptContent) continue;

            const regex = /document\.getElementById\(['"]([^'"]+)['"]\)\.innerHTML\s*=\s*(.+);/g;
            let match;

            while ((match = regex.exec(scriptContent)) !== null) {
                let expr = match[2]
                    .replace(/\+ ?''/g, '')
                    .replace(/\.substring\((\d+)\)/g, (_, p) => `.slice(${p})`);

                let link;
                try {
                    link = eval(expr);
                } catch {
                    continue;
                }

                const qs = link.split('?')[1];
                if (!qs) continue;

                const p = new URLSearchParams(qs);
                const data = {
                    id_video: p.get('id'),
                    expires: p.get('expires'),
                    ip: p.get('ip'),
                    token: p.get('token')
                };

                // 🔥 VALIDAMOS
                const valid = await checkSTLink(data);
                if (valid) {
                    console.log('[ST]: Link válido encontrado');
                    return { 
                        url: valid
                    };
                }
            }
        }

        console.log('[ST]: Ningún link válido');
        return { status: 506, msj: 'Ningun link Valido' };

    } catch (e) {
        console.log('[ST ERROR]:' + e.message);
        return { status: 704, msj: e.message, server: 'stape'};
    }
}


module.exports = { extractST };
