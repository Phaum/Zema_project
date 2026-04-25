const REKORB_BASE_URL = 'https://rekorb.ru';
const REKORB_LIST_URL = `${REKORB_BASE_URL}/offices/biznes-centry/`;
const REKORB_AJAX_URL = `${REKORB_BASE_URL}/bitrix/templates/.default/ajax/ajax.php`;
const REKORB_PAGE_SIZE = 30;
const REKORB_MAX_PAGES = 40;
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const MATCHING_CACHE_VERSION = 'v3';

const cache = new Map();
const pageCache = new Map();
const ADDRESS_STOP_WORDS = new Set([
    'российская',
    'россия',
    'федерация',
    'санкт',
    'петербург',
    'город',
    'внутригородское',
    'муниципальное',
    'образование',
    'федерального',
    'значения',
    'муниципальный',
    'округ',
    'район',
    'улица',
    'ул',
    'проспект',
    'пр',
    'площадь',
    'пл',
    'набережная',
    'наб',
    'дом',
    'д',
    'корпус',
    'к',
    'литера',
    'лит',
    'строение',
    'стр',
    'бизнес',
    'центр',
    'бц',
]);

function decodeHtml(value = '') {
    return String(value)
        .replace(/&nbsp;/gi, ' ')
        .replace(/&quot;/gi, '"')
        .replace(/&#039;/g, "'")
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>');
}

function stripTags(value = '') {
    return decodeHtml(String(value).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function absoluteUrl(value) {
    if (!value) return null;
    try {
        return new URL(value, REKORB_BASE_URL).toString();
    } catch {
        return null;
    }
}

function normalizeAddressText(value = '') {
    return stripTags(value)
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/(^|[^a-zа-я])лит(?:ера|ер)?\.?\s*([a-zа-я])(?=$|[^a-zа-я])/gi, '$1 лит $2 ')
        .replace(/[«»"']/g, ' ')
        .replace(/[,.;:()№]/g, ' ')
        .replace(/\bпр-кт\b/g, ' проспект ')
        .replace(/\bпр\b/g, ' проспект ')
        .replace(/\bул\b/g, ' улица ')
        .replace(/\bнаб\b/g, ' набережная ')
        .replace(/\bпл\b/g, ' площадь ')
        .replace(/\bд\b/g, ' дом ')
        .replace(/\bк\b/g, ' корпус ')
        .replace(/\bстр\b/g, ' строение ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenizeAddress(value = '') {
    const normalized = normalizeAddressText(value);
    return normalized
        .split(/[^a-zа-я0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => (/^\d/.test(token) || token.length >= 2) && !ADDRESS_STOP_WORDS.has(token));
}

function extractAddressComponents(value = '') {
    const normalized = normalizeAddressText(value);
    const tokens = normalized.split(/\s+/).filter(Boolean);

    const pickAfter = (labels, matcher) => {
        for (let index = 0; index < tokens.length; index += 1) {
            const token = tokens[index];

            if (labels.includes(token) && matcher.test(tokens[index + 1] || '')) {
                return tokens[index + 1];
            }
        }

        return null;
    };

    const gluedLitera = tokens
        .map((token) => token.match(/^лит([a-zа-я])$/i)?.[1])
        .find(Boolean);

    return {
        house: pickAfter(['дом', 'д'], /^\d+[a-zа-я]?$/i),
        building: pickAfter(['строение', 'стр'], /^\d+[a-zа-я]?$/i),
        corpus: pickAfter(['корпус', 'к'], /^\d+[a-zа-я]?$/i),
        litera: pickAfter(['лит', 'литера', 'литер'], /^[a-zа-я]$/i) || gluedLitera || null,
    };
}

function getAddressNumbers(tokens) {
    return tokens.filter((token) => /^\d+[a-zа-я]?$/i.test(token));
}

function isAddressNumberToken(token) {
    return /^\d+[a-zа-я]?$/i.test(token);
}

function hasRequiredComponentMatch(targetComponents, candidateComponents) {
    const targetHasStructure = Boolean(targetComponents.building || targetComponents.corpus);
    const candidateHasStructure = Boolean(candidateComponents.building || candidateComponents.corpus);

    for (const key of ['building', 'corpus', 'litera']) {
        if (targetComponents[key]) {
            if (
                key === 'litera' &&
                targetHasStructure &&
                candidateHasStructure &&
                !candidateComponents[key]
            ) {
                continue;
            }

            if (candidateComponents[key] !== targetComponents[key]) {
                return false;
            }

            continue;
        }

        if (candidateComponents[key]) {
            return false;
        }
    }

    return true;
}

function getSpecificComponentCount(components = {}) {
    return ['building', 'corpus', 'litera'].filter((key) => Boolean(components[key])).length;
}

function getHouseKey(address = '') {
    const components = extractAddressComponents(address);
    if (components.house) {
        return `house:${components.house}`;
    }

    const numbers = getAddressNumbers(tokenizeAddress(address));
    return numbers[0] ? `number:${numbers[0]}` : null;
}

export function scoreRekorbAddressMatch(targetAddress, candidateAddress) {
    const targetComponents = extractAddressComponents(targetAddress);
    const candidateComponents = extractAddressComponents(candidateAddress);

    if (!hasRequiredComponentMatch(targetComponents, candidateComponents)) {
        return 0;
    }

    const targetTokens = tokenizeAddress(targetAddress);
    const candidateTokens = tokenizeAddress(candidateAddress);

    if (!targetTokens.length || !candidateTokens.length) {
        return 0;
    }

    const candidateSet = new Set(candidateTokens);
    const targetNumbers = getAddressNumbers(targetTokens);
    const candidateNumbers = new Set(getAddressNumbers(candidateTokens));
    const numericMatches = targetNumbers.filter((token) => candidateNumbers.has(token)).length;

    if (targetNumbers.length && !numericMatches) {
        return 0;
    }

    const targetUnique = [...new Set(targetTokens)];
    const targetWords = targetUnique.filter((token) => !isAddressNumberToken(token));
    const candidateWords = new Set(candidateTokens.filter((token) => !isAddressNumberToken(token)));
    const wordMatches = targetWords.filter((token) => candidateWords.has(token)).length;

    if (targetWords.length && !wordMatches) {
        return 0;
    }

    const textMatches = targetUnique.filter((token) => candidateSet.has(token)).length;
    const denominator = Math.min(Math.max(targetUnique.length, 1), 8);
    const numericBonus = targetNumbers.length
        ? Math.min(numericMatches / targetNumbers.length, 1) * 0.35
        : 0;

    return Math.min(1, (textMatches / denominator) + numericBonus);
}

function extractFirstMatch(text, regex) {
    const match = regex.exec(text);
    regex.lastIndex = 0;
    return match?.[1] ? stripTags(match[1]) : null;
}

function extractCards(html = '') {
    const blocks = String(html).split(/<div class="col-6 col-sm-4 col-md-6 col-lg-4 col-list-card-wrap">/g).slice(1);

    return blocks
        .map((block) => {
            const imageUrl = absoluteUrl(
                extractFirstMatch(block, /<meta\s+itemprop="image"\s+content="([^"]+)"/i) ||
                extractFirstMatch(block, /<img[^>]+src="([^"]+)"/i)
            );
            const pageUrl = absoluteUrl(extractFirstMatch(block, /<a[^>]+itemprop="url"[^>]+href="([^"]+)"/i));
            const title = extractFirstMatch(block, /<span\s+itemprop="name">([\s\S]*?)<\/span>/i);
            const address = extractFirstMatch(block, /<div class="obj_address[^"]*">([\s\S]*?)<\/div>/i);

            if (!address || !imageUrl) {
                return null;
            }

            return {
                title,
                address,
                imageUrl,
                pageUrl,
                source: 'rekorb',
            };
        })
        .filter(Boolean);
}

function extractDetailImageUrl(html = '') {
    return absoluteUrl(
        extractFirstMatch(html, /<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
        extractFirstMatch(html, /<meta\s+itemprop="contentUrl"\s+content="([^"]+)"/i) ||
        extractFirstMatch(html, /<div class="photo_card"[\s\S]*?<img[^>]+src="([^"]+)"/i)
    );
}

async function fetchRekorbDetailImageUrl(pageUrl) {
    const url = absoluteUrl(pageUrl);
    if (!url || !url.startsWith(`${REKORB_BASE_URL}/offices/`)) {
        return null;
    }

    const cacheKey = `detail-image:${url}`;
    const cached = getCached(cacheKey);
    if (cached !== null) {
        return cached;
    }

    const response = await fetch(url, {
        headers: {
            'user-agent': 'ZemaProject/1.0 (+https://rekorb.ru photo lookup)',
            accept: 'text/html',
            referer: REKORB_LIST_URL,
        },
    });

    if (!response.ok) {
        throw new Error(`Rekorb detail request failed: ${response.status}`);
    }

    const imageUrl = extractDetailImageUrl(await response.text());
    setCached(cacheKey, imageUrl);
    return imageUrl;
}

async function fetchRekorbPage(page = 1) {
    const pageCacheKey = `page:${page}`;
    const cached = getCached(pageCacheKey);
    if (cached !== null) {
        return cached;
    }

    let html;

    if (page <= 1) {
        const response = await fetch(REKORB_LIST_URL, {
            headers: {
                'user-agent': 'ZemaProject/1.0 (+https://rekorb.ru photo lookup)',
                accept: 'text/html',
            },
        });

        if (!response.ok) {
            throw new Error(`Rekorb list request failed: ${response.status}`);
        }

        html = await response.text();
        setCached(pageCacheKey, html);
        return html;
    }

    const body = new URLSearchParams({
        m: 'load_more_cards',
        listing: '1',
        num_page: String(page),
        page_size: String(REKORB_PAGE_SIZE),
        typeobj: '118',
        typedeal: 'objects',
        order: 'popular',
        filter_template: 'list',
        valute: '1',
    });

    const response = await fetch(REKORB_AJAX_URL, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'user-agent': 'ZemaProject/1.0 (+https://rekorb.ru photo lookup)',
            referer: REKORB_LIST_URL,
        },
        body,
    });

    if (!response.ok) {
        throw new Error(`Rekorb ajax request failed: ${response.status}`);
    }

    html = await response.text();
    setCached(pageCacheKey, html);
    return html;
}

function getCached(cacheKey) {
    const cached = cache.get(cacheKey);
    if (!cached) return null;

    if (Date.now() - cached.createdAt > CACHE_TTL_MS) {
        cache.delete(cacheKey);
        return null;
    }

    return cached.value;
}

function setCached(cacheKey, value) {
    cache.set(cacheKey, {
        createdAt: Date.now(),
        value,
    });
}

export async function findRekorbObjectPhotoByAddress(address) {
    const normalizedAddress = normalizeAddressText(address);
    if (!normalizedAddress) {
        return null;
    }

    const cacheKey = `${MATCHING_CACHE_VERSION}:${normalizedAddress}`;
    const cached = getCached(cacheKey);
    if (cached !== null) {
        return cached;
    }

    let bestMatch = null;
    const targetComponents = extractAddressComponents(address);
    const targetSpecificComponentCount = getSpecificComponentCount(targetComponents);
    const targetHouseKey = getHouseKey(address);
    const candidatesOnSameHouse = [];

    for (let page = 1; page <= REKORB_MAX_PAGES; page += 1) {
        const html = await fetchRekorbPage(page);
        const cards = extractCards(html);

        if (!cards.length) {
            break;
        }

        for (const card of cards) {
            if (targetHouseKey && getHouseKey(card.address) === targetHouseKey) {
                candidatesOnSameHouse.push(card);
            }

            const score = scoreRekorbAddressMatch(address, card.address);
            if (!bestMatch || score > bestMatch.score) {
                bestMatch = {
                    ...card,
                    score,
                    matchedAddress: card.address,
                    sourcePage: page,
                };
            }
        }

        if (bestMatch?.score >= 0.86 && targetSpecificComponentCount > 0) {
            break;
        }
    }

    const bestComponents = bestMatch ? extractAddressComponents(bestMatch.address) : {};
    const bestSpecificComponentCount = getSpecificComponentCount(bestComponents);
    const sameHouseSpecificVariants = new Set(
        candidatesOnSameHouse
            .map((card) => {
                const components = extractAddressComponents(card.address);
                return ['building', 'corpus', 'litera']
                    .map((key) => components[key] ? `${key}:${components[key]}` : null)
                    .filter(Boolean)
                    .join('|');
            })
            .filter(Boolean)
    );
    const ambiguousSameHouse = (
        targetHouseKey &&
        targetSpecificComponentCount === 0 &&
        bestSpecificComponentCount > 0 &&
        sameHouseSpecificVariants.size > 1
    );

    let result = null;

    if (bestMatch?.score >= 0.62 && !ambiguousSameHouse) {
        let detailImageUrl = null;
        if (bestMatch.pageUrl) {
            try {
                detailImageUrl = await fetchRekorbDetailImageUrl(bestMatch.pageUrl);
            } catch (error) {
                console.warn('Не удалось получить детальное фото Rekorb:', error.message);
            }
        }

        result = {
            title: bestMatch.title,
            address: bestMatch.address,
            matchedAddress: bestMatch.matchedAddress,
            imageUrl: detailImageUrl || bestMatch.imageUrl,
            previewImageUrl: bestMatch.imageUrl,
            pageUrl: bestMatch.pageUrl,
            score: bestMatch.score,
            source: bestMatch.source,
        };
    }

    setCached(cacheKey, result);
    return result;
}

export async function fetchRekorbImageDataUrl(imageUrl) {
    const url = absoluteUrl(imageUrl);
    if (!url || !url.startsWith(`${REKORB_BASE_URL}/upload/`)) {
        return null;
    }

    const cached = getCached(`image:${url}`);
    if (cached !== null) {
        return cached;
    }

    const response = await fetch(url, {
        headers: {
            'user-agent': 'ZemaProject/1.0 (+https://rekorb.ru photo lookup)',
            referer: REKORB_LIST_URL,
        },
    });

    if (!response.ok) {
        throw new Error(`Rekorb image request failed: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    const dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`;

    setCached(`image:${url}`, dataUrl);
    return dataUrl;
}
