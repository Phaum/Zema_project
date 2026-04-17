import proj4 from 'proj4';

const MSK1964_SPB = "+proj=tmerc +lat_0=0 +lon_0=30 +k=1 +x_0=95942.85 +y_0=-6552812.25 +ellps=krass +units=m +no_defs";
const WGS84 = "EPSG:4326";

export function msk64ToWgs84(x, y) {
    const E = Number(y);
    const N = Number(x);
    const [lon, lat] = proj4(MSK1964_SPB, WGS84, [E, N]);
    return { lat, lon };
}
