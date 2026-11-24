const express = require('express');
var cors = require('cors');
const app = express()
const port = 3000

app.use(cors());

const cache = new Map();

const getPaginationData = (data, page) => {
    const result = data.slice(0, 3 * (Number(page) + 1));
    const hasMore = result.length ? result[result.length - 1] !== data[data.length - 1] : false;
    if (result.length === 0) {
        throw new Error({ error: 'Такой страницы нет' });
    }
    return {data: result, hasMore};
}

const filterByGenre = (data, genre) => {
    if (!genre) return data;
    const filteredData = data.filter((movie) => movie.show.genres.includes(genre));
    if (filteredData.length === 0) throw new Error({error: 'Ни одного фильма с таким жанром нет!'})
    return filteredData;
}

const getGenres = (data) => {
    const genresMap = new Map();
    const genres = [];
    data.forEach((movie) => movie.show.genres.forEach((genre) => {
        if (genresMap.has(genre)) return;
        genres.push(genre);
        genresMap.set(genre, true);
    }));
    return genres;
}

app.get('/shows', async (req, res) => {
    const query = req.query.q;
    const genre = req.query.genre;
    const page = req.query.page;

    if (typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ error: 'Укажи правильный параметр q' });
    }

    if (genre && typeof genre !== 'string') {
        return res.status(400).json({ error: 'Укажи правильный параметр genre' });
    }

    if (page && !/^\d+$/.test(page)) {
        return res.status(400).json({ error: 'Укажи правильный параметр page' });
    }

    const url = new URL('https://api.tvmaze.com/search/shows');
    url.searchParams.set('q', query.trim());
    const signal = AbortSignal.timeout(5000);

    if (cache.has(query.trim())) {
        const cacheData = cache.get(query.trim());
        const isCacheFresh = cacheData.updated ? new Date() - cacheData.updated < 5 * 60 * 1000 : false;
        if (isCacheFresh) {
            try {
                const filteredData = filterByGenre(cacheData.data, genre);
                return res.json({...getPaginationData(filteredData, page), cached: true, page, genres: cacheData.genres});
            } catch (err) {
                return res.status(400).json({error: err.error});
            }
        }
    }

    try {
        const result = await fetch(url, { signal });

        if (!result.ok) {
            return res.status(502).json({ error: 'TVmaze вернул ошибку' });
        }
        const resultJson = await result.json();
        const genres = getGenres(resultJson);
        cache.set(query.trim(), { data: resultJson, updated: new Date(), genres });
        try {
            const filteredData = filterByGenre(resultJson, genre);
            return res.json({...getPaginationData(filteredData, page), page, genres});
        } catch (err) {
            return res.status(400).json({ error: err.error });
        }
    } catch {
        if (signal.aborted) {
            return res.status(504).json({ error: 'TVmaze не ответил вовремя' });
        }

        return res.status(502).json({ error: 'Не удалось получить данные от TVmaze' });
    }
});

app.listen(port)
