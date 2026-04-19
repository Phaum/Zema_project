import { api } from '../shared/api';
import { formatEnvironmentCategories } from './environmentLabels';

export async function prepareReportData(projectId) {

  const { data: questionnaire } = await api.get(`/projects/${projectId}/questionnaire`);
  const marketRateMin = Math.min(...includedRates);
  const marketRateMax = Math.max(...includedRates);
  const landAreaUsedPercent = landArea && landAreaUsed ? (landAreaUsed / landArea) * 100 : 0;

  
  let calculation = {};
  try {
    const { data } = await api.get(`/projects/${projectId}/calculation`);
    calculation = data;
  } catch {
    console.warn('Результаты расчёта не найдены, будут использованы нулевые значения');
  }

  let comparables = [];
  if (questionnaire.buildingCadastralNumber) {
    const { data } = await api.get('/market/offers', {
      params: { cadNumber: questionnaire.buildingCadastralNumber }
    });
    comparables = data;
  }

  const baseStaticUrl = `/static/projects/${projectId}`;
  const mapImageUrl = `${baseStaticUrl}/location_map.png`;
  const comparablesMapImageUrl = `${baseStaticUrl}/comparables_map.png`;
  const quarterlyChartUrl = `${baseStaticUrl}/quarterly_chart.png`;
  const dynamicsChartUrl = `${baseStaticUrl}/dynamics_chart.png`;

  const totalArea = questionnaire.totalArea || 0;
  const leasableArea = questionnaire.leasableArea || 0;
  const leasableAreaPercent = totalArea > 0 ? (leasableArea / totalArea) * 100 : 0;

  return {

    assessmentDate: questionnaire.valuationDate,
    objectAddress: questionnaire.objectAddress,
    reconstructionYear: questionnaire.reconstructionYear,
    landAreaUsedPercent, 
    marketRateMin,
    marketRateMax,
    cadastralNumber: questionnaire.buildingCadastralNumber,
    totalArea: totalArea,
    constructionYear: questionnaire.constructionYear,
    constructionCompletionYear: questionnaire.constructionCompletionYear || questionnaire.completionYear || null,
    commissioningYear: questionnaire.commissioningYear || questionnaire.yearCommissioning || questionnaire.year_commisioning || questionnaire.constructionYear,
    hasReconstruction: questionnaire.hasReconstruction || false,
    reconstructionYear: questionnaire.reconstructionYear,
    objectType: questionnaire.objectType,
    propertyType: questionnaire.actualUse || questionnaire.objectType,
    businessClass: questionnaire.businessCenterClass,
    classConfirmedByRGUD: questionnaire.classConfirmedByRGUD || false,
    
    district: questionnaire.district,
    nearestMetro: questionnaire.nearestMetro,
    distanceToMetro: questionnaire.metroDistance,
    isHistoricalCenter: questionnaire.isHistoricalCenter,
    territorialZone: questionnaire.terZone,
    objectLocationDescription: questionnaire.objectLocationDescription || '—',
    nearbyEnvironment: formatEnvironmentCategories([
      questionnaire.environmentCategory1,
      questionnaire.environmentCategory2,
      questionnaire.environmentCategory3
    ]),

    floors: questionnaire.floors || [],
    landCadastralNumber: questionnaire.landCadastralNumber,
    landArea: questionnaire.landArea,
    landAreaUsed: calculation.landAreaUsed || questionnaire.landAreaUsed || 0,
    leasableArea: leasableArea,
    leasableAreaPercent: leasableAreaPercent,
    marketAverageRate: questionnaire.averageRentalRate || calculation.marketAverageRate || 0,
    
    cadastralValue: questionnaire.cadCost,
    
    estimatedValue: calculation.estimatedValue || 0,
    estimatedValueMin: calculation.estimatedValueMin || 0,
    estimatedValueMax: calculation.estimatedValueMax || 0,
    pricePerM2: calculation.pricePerM2 || 0,
    pricePerM2Min: calculation.pricePerM2Min || 0,
    pricePerM2Max: calculation.pricePerM2Max || 0,
    grossIncome: calculation.grossIncome || 0,
    egi: calculation.egi || 0,
    noi: calculation.noi || 0,
    estimatedValueWithLand: calculation.estimatedValueWithLand || 0,
    
    comparables: comparables.map(offer => ({
      price_per_meter_cut_nds: offer.price_per_sqm_cleaned,
      district: offer.district,
      station_name: offer.metro,
      distance_to_station: offer.metro_distance,
      is_historical_center: offer.environment_historical_center,
      ter_zone: offer.ter_zone,
      environment_category_1: offer.environment_category_1,
      environment_category_2: offer.environment_category_2,
      environment_category_3: offer.environment_category_3,
    })),
    
    quarterlyDistribution: calculation.quarterlyDistribution || [],
    marketDynamics: calculation.marketDynamics || [],
    
    photoUrls: questionnaire.photoUrls || [],
    mapImageUrl,
    comparablesMapImageUrl,
    quarterlyChartUrl,
    dynamicsChartUrl,
  };
}
