/**
 * Weather Provider Abstraction Contract
 * Decouples external meteorology vendors (Open-Meteo, IMD, etc.) from domain services.
 */

import { IWeatherProvider, NormalizedWeatherDTO } from '../types/weather.types.js';

export { IWeatherProvider, NormalizedWeatherDTO };
