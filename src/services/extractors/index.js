// src/services/extractors/index.js
//
// Registration point for all built-in research extractors. Import this module
// once (side-effect: registers topics) so the registry is populated at startup.

import { registerExtractor } from '../extractionService.js';
import { extract as extractRoboticsCompanies } from './roboticsCompanies.js';

registerExtractor('robotics-companies', { extract: extractRoboticsCompanies });