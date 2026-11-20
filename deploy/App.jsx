/*import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";

import { 
  loadWasm, 
  isWasmLoaded, 
  createWrapper, 
  toWasmVector, 
  fromWasmVector,
  EstimatorType 
} from './wasmLoader';*/

const { useState, useCallback, useRef, useEffect, useMemo } = React;
const { 
  loadWasm, 
  createWrapper, 
  toWasmVector, 
  fromWasmVector,
  EstimatorType 
} = window.WasmLoader;


// === DATA MODEL ===

const CellStatus = {
  CONTROL: "control",
  INTERVENTION: "intervention",
  NOT_ENROLLED: "not_enrolled",
};

class DesignCell {
  constructor(
    status = CellStatus.CONTROL,
    sampleSize = null,
    clusterSize = null
  ) {
    this.status = status;
    this.sampleSize = sampleSize;
    this.clusterSize = clusterSize;
  }

  clone() {
    return new DesignCell(this.status, this.sampleSize, this.clusterSize);
  }

  toJSON() {
    return {
      status: this.status,
      sampleSize: this.sampleSize,
      clusterSize: this.clusterSize,
    };
  }

  static fromJSON(json) {
    return new DesignCell(json.status, json.sampleSize, json.clusterSize);
  }
}

class TrialDesign {
  constructor(numSequences = 4, numPeriods = 5) {
    this._grid = [];
    this._sequenceLabels = [];
    this._periodLabels = [];
    this._clustersPerSequence = Array(numSequences).fill(1);

    for (let i = 0; i < numSequences; i++) {
      this._sequenceLabels.push(`Sequence ${i + 1}`);
      const row = [];
      for (let j = 0; j < numPeriods; j++) {
        row.push(new DesignCell());
      }
      this._grid.push(row);
    }

    for (let j = 0; j < numPeriods; j++) {
      this._periodLabels.push(`Period ${j}`);
    }
  }

  get numSequences() {
    return this._grid.length;
  }
  get numPeriods() {
    return this._grid[0]?.length || 0;
  }

  getCell(row, col) {
    if (
      row < 0 ||
      row >= this.numSequences ||
      col < 0 ||
      col >= this.numPeriods
    ) {
      return null;
    }
    return this._grid[row][col];
  }

  setCellStatus(row, col, status) {
    const cell = this.getCell(row, col);
    if (cell) cell.status = status;
  }

  getClusters(sequenceIndex) {
    return this._clustersPerSequence[sequenceIndex] ?? 1;
  }

  setClusters(sequenceIndex, count) {
    if (sequenceIndex >= 0 && sequenceIndex < this.numSequences) {
      this._clustersPerSequence[sequenceIndex] = Math.max(1, Math.floor(count));
    }
  }

  insertSequence(index, cells = null) {
    const newRow =
      cells ||
      Array(this.numPeriods)
        .fill(null)
        .map(() => new DesignCell());
    this._grid.splice(index, 0, newRow);
    this._sequenceLabels.splice(index, 0, `Sequence ${index + 1}`);
    this._clustersPerSequence.splice(index, 0, 1);
  }

  removeSequence(index) {
    if (this.numSequences <= 2) return false;
    this._grid.splice(index, 1);
    this._sequenceLabels.splice(index, 1);
    this._clustersPerSequence.splice(index, 1);
    return true;
  }

  insertPeriod(index, cells = null) {
    for (let i = 0; i < this.numSequences; i++) {
      const newCell = cells ? cells[i] : new DesignCell();
      this._grid[i].splice(index, 0, newCell);
    }
    this._periodLabels.splice(index, 0, `Period ${index}`);
  }

  removePeriod(index) {
    if (this.numPeriods <= 1) return false;
    for (let i = 0; i < this.numSequences; i++) {
      this._grid[i].splice(index, 1);
    }
    this._periodLabels.splice(index, 1);
    return true;
  }

  setAllInSequence(sequenceIndex, status) {
    if (sequenceIndex >= 0 && sequenceIndex < this.numSequences) {
      this._grid[sequenceIndex].forEach((cell) => (cell.status = status));
    }
  }

  setAllInPeriod(periodIndex, status) {
    if (periodIndex >= 0 && periodIndex < this.numPeriods) {
      this._grid.forEach((row) => (row[periodIndex].status = status));
    }
  }

  countByStatus(status) {
    let count = 0;
    this._grid.forEach((row) => {
      row.forEach((cell) => {
        if (cell.status === status) count++;
      });
    });
    return count;
  }

  getTotalClusters() {
    return this._clustersPerSequence.reduce((sum, c) => sum + c, 0);
  }

  toJSON() {
    return {
      grid: this._grid.map((row) => row.map((cell) => cell.toJSON())),
      sequenceLabels: this._sequenceLabels,
      periodLabels: this._periodLabels,
      clustersPerSequence: this._clustersPerSequence,
    };
  }

  clone() {
    const newDesign = new TrialDesign(0, 0);
    newDesign._grid = this._grid.map((row) => row.map((cell) => cell.clone()));
    newDesign._sequenceLabels = [...this._sequenceLabels];
    newDesign._periodLabels = [...this._periodLabels];
    newDesign._clustersPerSequence = [...this._clustersPerSequence];
    return newDesign;
  }

  getGrid() {
    return this._grid;
  }

  static fromJSON(json) {
  const design = new TrialDesign(json.numSequences, json.numPeriods);
  
  // Clear and rebuild grid from JSON
  design._grid = json.grid.map(row => 
    row.map(cell => {
      const newCell = new DesignCell(cell.status);
      if (cell.sampleSize != null) {
        newCell.sampleSize = cell.sampleSize;
      }
      if (cell.clusterSize != null) {
        newCell.clusterSize = cell.clusterSize;
      }
      return newCell;
    })
  );
  
  // Restore clusters per sequence
  if (json.clustersPerSequence) {
    design._clustersPerSequence = [...json.clustersPerSequence];
  }
  
  return design;
}

  static createParallel(numSequences = 2, numPeriods = 1) {
    const design = new TrialDesign(numSequences, numPeriods);
    for (let i = 0; i < numSequences; i++) {
      const status =
        i < numSequences / 2 ? CellStatus.CONTROL : CellStatus.INTERVENTION;
      design.setAllInSequence(i, status);
    }
    return design;
  }

  static createSteppedWedge(numSequences = 4, numPeriods = 5) {
    const design = new TrialDesign(numSequences, numPeriods);
    for (let i = 0; i < numSequences; i++) {
      for (let j = 0; j < numPeriods; j++) {
        const switchPoint = i + 1;
        const status =
          j < switchPoint ? CellStatus.CONTROL : CellStatus.INTERVENTION;
        design.setCellStatus(i, j, status);
      }
    }
    return design;
  }

  static createCrossover(
    numSequences = 2,
    numPeriods = 2,
    includeWashout = false
  ) {
    const actualPeriods = includeWashout ? numPeriods * 2 - 1 : numPeriods;
    const design = new TrialDesign(numSequences, actualPeriods);

    for (let i = 0; i < numSequences; i++) {
      let treatmentPhase = i % 2 === 0;
      for (let j = 0; j < actualPeriods; j++) {
        if (includeWashout && j > 0 && j % 2 === 1) {
          design.setCellStatus(i, j, CellStatus.NOT_ENROLLED);
        } else {
          design.setCellStatus(
            i,
            j,
            treatmentPhase ? CellStatus.INTERVENTION : CellStatus.CONTROL
          );
          treatmentPhase = !treatmentPhase;
        }
      }
    }
    return design;
  }

  static createParallelBaseline(numSequences = 2, numPeriods = 2) {
  // First period is baseline (control), then parallel
  const design = new TrialDesign(numSequences, numPeriods);
  for (let i = 0; i < numSequences; i++) {
    for (let j = 0; j < numPeriods; j++) {
      if (j === 0) {
        // Baseline period - all control
        design.setCellStatus(i, j, CellStatus.CONTROL);
      } else {
        // Parallel: first half control, second half intervention
        const status = i < numSequences / 2 ? CellStatus.CONTROL : CellStatus.INTERVENTION;
        design.setCellStatus(i, j, status);
      }
    }
  }
  return design;
}

static createSteppedWedgeImplementation(numSequences = 4, numPeriods = 6) {
  // Stepped wedge with NOT_ENROLLED implementation period between control and intervention
  const design = new TrialDesign(numSequences, numPeriods);
  for (let i = 0; i < numSequences; i++) {
    for (let j = 0; j < numPeriods; j++) {
      const switchPoint = i + 1;
      let status;
      if (j < switchPoint) {
        status = CellStatus.CONTROL;
      } else if (j === switchPoint) {
        status = CellStatus.NOT_ENROLLED;  // Implementation period
      } else {
        status = CellStatus.INTERVENTION;
      }
      design.setCellStatus(i, j, status);
    }
  }
  return design;
}

static createStaircase(numSequences = 4, numPeriods = 4) {
  // Only diagonal cells enrolled - control then intervention
  const design = new TrialDesign(numSequences, numPeriods);
  for (let i = 0; i < numSequences; i++) {
    for (let j = 0; j < numPeriods; j++) {
      if (j === i) {
        design.setCellStatus(i, j, CellStatus.CONTROL);
      } else if (j === i + 1) {
        design.setCellStatus(i, j, CellStatus.INTERVENTION);
      } else {
        design.setCellStatus(i, j, CellStatus.NOT_ENROLLED);
      }
    }
  }
  return design;
}
}



// Normal distribution CDF approximation
function normalCDF(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  
  return 0.5 * (1.0 + sign * y);
}

// T-distribution CDF approximation (using normal approximation for large df)
function tCDF(t, df) {
  if (df > 100) {
    return normalCDF(t);
  }
  
  // Approximation using incomplete beta function
  const x = df / (df + t * t);
  const a = df / 2;
  const b = 0.5;
  
  // Regularized incomplete beta function approximation
  const bt = Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b) +
    a * Math.log(x) + b * Math.log(1 - x)
  );
  
  if (x < (a + 1) / (a + b + 2)) {
    const beta = bt * betaCF(x, a, b) / a;
    return t > 0 ? 1 - beta / 2 : beta / 2;
  } else {
    const beta = bt * betaCF(1 - x, b, a) / b;
    return t > 0 ? 1 - (1 - beta) / 2 : (1 - beta) / 2;
  }
}

// T-distribution quantile approximation
function tQuantile(p, df) {
  if (df > 100) {
    return normalQuantile(p);
  }
  
  // Approximation using normal quantile with correction
  const z = normalQuantile(p);
  const z2 = z * z;
  
  // Cornish-Fisher expansion
  const t = z + (z2 * z - 3 * z) / (4 * df) +
            (z2 * z2 * z - 10 * z2 * z + 9 * z) / (96 * df * df);
  
  return t;
}

// Normal quantile (inverse CDF) approximation
function normalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  
  // Rational approximation
  const a = [
    -3.969683028665376e+01,
    2.209460984245205e+02,
    -2.759285104469687e+02,
    1.383577518672690e+02,
    -3.066479806614716e+01,
    2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01,
    1.615858368580409e+02,
    -1.556989798598866e+02,
    6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
    4.374664141464968e+00,
    2.938163982698783e+00
  ];
  const d = [
    7.784695709041462e-03,
    3.224671290700398e-01,
    2.445134137142996e+00,
    3.754408661907416e+00
  ];
  
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q, r;
  
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
           ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

// Log gamma function
function lgamma(x) {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    ser += cof[j] / ++y;
  }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

// Continued fraction for incomplete beta
function betaCF(x, a, b) {
  const maxIter = 100;
  const eps = 3e-7;
  
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  
  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  
  return h;
}

// Singleton WASM wrapper instance per design
let wasmReady = false;

const MathsInterface = {
  // Cache for GLMM wrapper objects (keyed by design ID)
  _modelCache: new Map(),

  // Column names for data matrix
  _colnames: ['cl', 't', 'n', 'int', 'int2', 'int12', 'control'],

  // Initialize the WASM module (call once at app startup)
  async initialize() {
    if (wasmReady) return true;
    try {
      await loadWasm();
      wasmReady = true;
      console.log('MathsInterface: WASM initialized');
      return true;
    } catch (err) {
      console.error('MathsInterface: Failed to initialize WASM:', err);
      return false;
    }
  },

  // Check if WASM is ready
  isReady() {
    return wasmReady;
  },

 _getDesignHash(design, options = {}) {
  const grid = design.getGrid();
  const structure = grid.map(row => 
    row.map(cell => cell.status === CellStatus.NOT_ENROLLED ? '0' : '1').join(',')
  ).join('|');
  const clusters = design._clustersPerSequence.join(',');
  const totalClusters = design._clustersPerSequence.reduce((a, b) => a + b, 0);
  const corrStructure = options.correlationStructure ?? 'exchangeable';
  const samplingStructure = options.samplingStructure ?? 'cross_section';
  const outcomeType = options.outcomeType ?? 'continuous';
  const meanClusterSize = options.meanClusterSize ?? 20;
  const sampleSizeMode = options.sampleSizeMode ?? 'fixed';

  const hash = `${design.numSequences}-${design.numPeriods}-${structure}-${clusters}-${totalClusters}-${corrStructure}-${samplingStructure}-${outcomeType}-${sampleSizeMode}-${meanClusterSize}`;
  
  console.log('_getDesignHash:', hash);
  return hash;
},

  // Convert design to data matrix (matches C++ generate_data function)
  _generateDataMatrix(design, options) {
    const grid = design.getGrid();
    const numSequences = design.numSequences;
    const numPeriods = design.numPeriods;

    // Build data matrix: [cl, t, n, int, int2, int12, control]
    const data = [];
    let clNumber = 1;

    for (let i = 0; i < numSequences; i++) {
      const nClusters = design.getClusters(i);
      for (let j = 0; j < nClusters; j++) {
        for (let t = 0; t < numPeriods; t++) {
          const cell = grid[i][t];
          if (cell.status !== CellStatus.NOT_ENROLLED) {
            const isIntervention = cell.status === CellStatus.INTERVENTION ? 1 : 0;
            const clusterPeriodSize = options.sampleSizeMode === "exact"
  ? (cell.sampleSize ?? options.meanClusterSize ?? 20)
  : (options.meanClusterSize ?? 20);
            
            const row = [
              clNumber,                    // cl: cluster number
              t + 1,                       // t: time period (1-indexed)
              clusterPeriodSize,           // n: cluster-period size
              isIntervention,              // int: intervention indicator
              0,                           // int2: second intervention (not used currently)
              0,                           // int12: interaction (int * int2)
              1 - isIntervention           // control: control indicator
            ];
            data.push(row);
          }
        }
        clNumber++;
      }
    }
    return data;
  },

  // Build formula string (matches C++ formula generation)
  _buildFormula(design, options) {
    let formula = 'int';
    const reString = options.heterogeneousTe ? 'int' : '1';
    
    // Two treatments (if applicable)
    if (options.twoTreatments) {
      formula += '+int2+int12';
    }

    // Time effects (if more than one period)
    if (design.numPeriods > 1) {
      if (options.timeEffect === 'linear') {
        formula += '+t';
      } else {
        formula += '+factor(t)'; // Fixed effects (default)
      }
    }

    // Covariance structure for cluster random effects
    switch (options.correlationStructure) {
      case 'exchangeable':
        formula += `+(${reString}|gr(cl))`;
        if (options.heterogeneousTe) formula += '+(control|gr(cl))';
        break;
      case 'nested_exchangeable':
        formula += `+(${reString}|gr(cl))+(${reString}|gr(cl,t))`;
        if (options.heterogeneousTe) formula += '+(control|gr(cl))+(control|gr(cl,t))';
        break;
      case 'exponential_decay':
        formula += `+(${reString}|gr(cl)*ar0(t))`;
        if (options.heterogeneousTe) formula += '+(control|gr(cl)*ar0(t))';
        break;
      case 'exponential_function':
        formula += `+(${reString}|gr(cl)*fexp0(t))`;
        if (options.heterogeneousTe) formula += '+(control|gr(cl)*fexp0(t))';
        break;
      default:
        formula += `+(${reString}|gr(cl))`;
    }

    // Individual-level covariance for cohort sampling
    if (options.samplingStructure === 'closed_cohort') {
      formula += '+(1|gr(cl))';
    } else if (options.samplingStructure === 'open_cohort') {
      formula += '+(1|gr(cl)*ar0(t))';
    }

    return formula;
  },

  // Get family string from outcome type
  _getFamily(outcomeType) {
    switch (outcomeType) {
      case 'binary': return 'binomial';
      case 'count': return 'poisson';
      default: return 'gaussian';
    }
  },

  // Get link function from outcome type
  _getLink(outcomeType) {
    switch (outcomeType) {
      case 'binary': return 'logit';
      case 'count': return 'log';
      default: return 'identity';
    }
  },

  // Get estimator code from string
  _getEstimatorCode(estimator) {
    return EstimatorType[estimator] ?? EstimatorType.mixed_model;
  },

  _getCorrelationStructure(correlationStructure) {
  const valid = ['exchangeable', 'nested_exchangeable', 'exponential_decay', 'exponential_function'];
  if (valid.includes(correlationStructure)) {
    return correlationStructure;
  }
  console.warn('Unknown correlation structure:', correlationStructure);
  return 'exchangeable';
},

_getSamplingStructure(samplingStructure) {
  switch (samplingStructure) {
    case 'cross_section': return 'cross_section';
    case 'closed_cohort': return 'closed_cohort';
    case 'open_cohort': return 'open_cohort';
    default: return 'cross_section';
  }
},
  // Calculate mean cluster-period size from data matrix
  _getMeanN(dataMatrix) {
    if (dataMatrix.length === 0) return 20;
    const totalN = dataMatrix.reduce((sum, row) => sum + row[2], 0);
    return totalN / dataMatrix.length;
  },

  // Create or retrieve WASM wrapper for a design
  _getWrapper(designId, design, options) {
    console.log('=== _getWrapper START ===');
  console.log('designId:', designId);
  
  if (!wasmReady) {
    throw new Error('WASM not initialized');
  }

  const hash = this._getDesignHash(design, options);
  const cached = this._modelCache.get(designId);

  console.log('=== _getWrapper ===');
  console.log('designId:', designId);
  console.log('computed hash:', hash);
  console.log('cached entry exists:', !!cached);
  console.log('cached hash:', cached?.hash);
  console.log('hashes match:', cached?.hash === hash);
  console.log('will rebuild:', !cached || cached.hash !== hash);

  

  if (cached && cached.hash === hash) {
    console.log('Reusing cached wrapper');
    this._updateWrapperParameters(cached.wrapper, options, cached.meanN, design.numPeriods);
    return cached.wrapper;
  }

  console.log('Building new wrapper...');
  
  const dataMatrix = this._generateDataMatrix(design, options);
console.log('dataMatrix rows:', dataMatrix.length);
console.log('dataMatrix cols:', dataMatrix[0]?.length);

const formula = this._buildFormula(design, options);
const family = this._getFamily(options.outcomeType);
const link = this._getLink(options.outcomeType);
const corrStructure = this._getCorrelationStructure(options.correlationStructure);
const samplingStructure = this._getSamplingStructure(options.samplingStructure);
const meanN = this._getMeanN(dataMatrix);  // Add this line

console.log('formula:', formula);
console.log('family:', family, 'link:', link);
console.log('corrStructure:', corrStructure);
console.log('samplingStructure:', samplingStructure);
console.log('meanN:', meanN);

  // Clean up old wrapper
  if (cached && cached.wrapper) {
    console.log('Deleting old wrapper');
    cached.wrapper.delete();
  }

  const wrapper = createWrapper();
  console.log('Wrapper created, now initializing...');
  
  const flatData = dataMatrix.flat();
  const nRows = dataMatrix.length;
  const nCols = dataMatrix[0]?.length ?? 7;
  
  console.log('nRows:', nRows, 'nCols:', nCols, 'flatData length:', flatData.length);
  
  const wasmData = toWasmVector(flatData);
  
  try {
    console.log('About to call wrapper.initialize with:');
  console.log('  formula:', formula);
  console.log('  nRows:', nRows, 'nCols:', nCols);
  console.log('  family:', family, 'link:', link);
  console.log('  corrStructure:', corrStructure);
  console.log('  samplingStructure:', samplingStructure);
    const success = wrapper.initialize(
      formula, wasmData, nRows, nCols, family, link, corrStructure, samplingStructure
    );
    console.log('initialize returned:', success);
      
      if (!success) {
        const error = wrapper.getLastError();
        console.error('WASM initialize failed:', error);
        throw new Error(`Model initialization failed: ${error}`);
      }
      
      console.log('Setting alpha...');
  wrapper.setAlpha(options.alpha ?? 0.05);
  
  console.log('Setting target power...');
  wrapper.setTargetPower(options.targetPower ?? 0.80);
  
  console.log('Setting include intercept...');
  wrapper.setIncludeIntercept(options.includeIntercept !== false);
  
  console.log('Calling _updateWrapperParameters...');
  this._updateWrapperParameters(wrapper, options, meanN, design.numPeriods);
  
  console.log('Caching wrapper...');
  this._modelCache.set(designId, { hash, wrapper, meanN, dataMatrix });
  
  console.log('_getWrapper complete');
  return wrapper;
      
    } finally {
      wasmData.delete(); // Clean up WASM memory
    }
  },

  // Transform parameters to link scale
_transformToLinkScale(baseline, treatmentEffect, outcomeType) {
  switch (outcomeType) {
    case 'binary': {
      // Logit link
      // baseline is control probability (e.g., 0.3)
      // treatmentEffect is absolute risk difference (e.g., 0.1 means 30% -> 40%)
      
      const p0 = Math.max(0.001, Math.min(0.999, baseline));
      const p1 = Math.max(0.001, Math.min(0.999, baseline + treatmentEffect));
      
      const baselineLink = Math.log(p0 / (1 - p0));  // logit(p0)
      const teLink = Math.log(p1 / (1 - p1)) - baselineLink;  // logit(p1) - logit(p0)
      
      return { baselineLink, teLink };
    }
    
    case 'count': {
      // Log link
      // baseline is control rate (e.g., 5 events per unit time)
      // treatmentEffect is rate ratio (e.g., 1.3 means 30% higher rate)
      
      const mu = Math.max(0.001, baseline);
      const baselineLink = Math.log(mu);
      const teLink = Math.log(treatmentEffect);  // log(RR)
      
      return { baselineLink, teLink };
    }
    
    default: {
      // Identity link: no transformation
      return { baselineLink: baseline, teLink: treatmentEffect };
    }
  }
},

  _updateWrapperParameters(wrapper, options, meanN, numPeriods) {
    console.log('=== _updateWrapperParameters START ===');
  if (!wrapper) {
    console.error('_updateWrapperParameters called with undefined wrapper');
    return;
  }
  
  const icc = options.icc ?? 0.05;
  const iac = options.iac ?? 0.8;
  const cacOrLengthscale = options.temporalCorrelation ?? options.cac ?? 0.8;
  const te = options.treatmentEffect ?? 0.5;
  const baseline = options.baseline ?? 0.5;
  const clusterSize = options.meanClusterSize ?? 20;
  const outcomeType = options.outcomeType ?? 'continuous';
  const replacementRate = options.replacementRate ?? 1.0;
  
  console.log('Parameters:', { icc, iac, cacOrLengthscale, te, baseline, clusterSize, outcomeType, replacementRate, numPeriods });
  
  const { baselineLink, teLink } = this._transformToLinkScale(baseline, te, outcomeType);
  console.log('Transformed:', { baselineLink, teLink });
  
  console.log('Calling setTreatmentEffect...');
  wrapper.setTreatmentEffect(teLink);
  
  console.log('Calling setAlpha...');
  wrapper.setAlpha(options.alpha ?? 0.05);
  
  console.log('Calling setTargetPower...');
  wrapper.setTargetPower(options.targetPower ?? 0.80);
  
  console.log('Calling setIncludeIntercept...');
  wrapper.setIncludeIntercept(options.includeIntercept !== false);
  
  console.log('Calling updateWeights...');
  wrapper.updateWeights(clusterSize);
  
  console.log('Calling updateParameters...');
  wrapper.updateParameters(
    icc, 
    iac, 
    cacOrLengthscale, 
    teLink, 
    baselineLink, 
    clusterSize, 
    numPeriods,
    replacementRate
  );

  console.log('=== _updateWrapperParameters COMPLETE ===');
},

  // === PUBLIC API ===

  getVerificationBundle(design, options, designId = '_verify') {
    if (!wasmReady) {
        throw new Error('WASM not initialized');
    }
    
    // Always use a dedicated ID and force a fresh build
    const tempId = '_verify_export';
    
    // Clear any previous verification wrapper
    const oldCached = this._modelCache.get(tempId);
    if (oldCached && oldCached.wrapper) {
        oldCached.wrapper.delete();
        this._modelCache.delete(tempId);
    }
    
    // This builds a fresh wrapper with current design + options
    const wrapper = this._getWrapper(tempId, design, options);
    
    const estimatorCode = this._getEstimatorCode(options.estimator);
    const cv = options.sampleSizeMode === 'exact' ? 0 : (options.cvClusterSize ?? 0);
    
    const raw = wrapper.getVerificationBundle(estimatorCode, cv);
    
    const convertMatrix = (me) => {
        if (!me || me.rows === 0 || me.cols === 0) return null;
        const size = me.data.size();
        if (size !== me.rows * me.cols) {
            console.warn(`Matrix dimension mismatch: ${me.rows}×${me.cols} but data has ${size} elements`);
            return null;
        }
        const flatData = [];
        for (let i = 0; i < size; i++) flatData.push(me.data.get(i));
        const matrix = [];
        for (let i = 0; i < me.rows; i++) {
            matrix.push(flatData.slice(i * me.cols, (i + 1) * me.cols));
        }
        return { data: matrix, rows: me.rows, cols: me.cols, label: me.label };
    };
    
    const convertVector = (v) => {
        const arr = [];
        for (let i = 0; i < v.size(); i++) arr.push(v.get(i));
        return arr;
    };
    
    const result = {
        X: convertMatrix(raw.X),
        Sigma: convertMatrix(raw.Sigma),
        M: convertMatrix(raw.M),
        Minv: convertMatrix(raw.Minv),
        bread: convertMatrix(raw.bread),
        meat: convertMatrix(raw.meat),
        V_working: convertMatrix(raw.V_working),
        Sigma_true: convertMatrix(raw.Sigma_true),
        beta: convertVector(raw.beta),
        theta: convertVector(raw.theta),
        var_delta: raw.var_delta,
        se: raw.se,
        dof: raw.dof,
        power: raw.power,
        te: raw.te,
        alpha: raw.alpha,
        target_power: raw.target_power,
        idx: raw.idx,
        estimator_name: raw.estimator_name,
        formula: raw.formula,
        family: raw.family,
        link: raw.link,
        correlation_structure: raw.correlation_structure,
        sampling_structure: raw.sampling_structure,
        valid: raw.valid,
        error: raw.error,
        dataMatrix: this._generateDataMatrix(design, options),
        numSequences: design.numSequences,
        numPeriods: design.numPeriods,
        totalClusters: design.getTotalClusters(),
        clustersPerSequence: [...design._clustersPerSequence],
        target_icc: raw.target_icc,
        target_iac: raw.target_iac,
        target_baseline: raw.target_baseline,
        target_baseline_trt: raw.target_baseline_trt,
        achieved_icc: raw.achieved_icc,
        achieved_iac: raw.achieved_iac,
        achieved_baseline: raw.achieved_baseline,
        achieved_baseline_trt: raw.achieved_baseline_trt,
        raw_sigma_c: raw.raw_sigma_c,
        raw_sigma_p: raw.raw_sigma_p,
        solver_iterations: raw.solver_iterations,
        solver_converged: raw.solver_converged,
        correlation_warning: raw.correlation_warning,
    };
    
    // Clean up — don't leave verification wrapper in cache
    const cached = this._modelCache.get(tempId);
    if (cached && cached.wrapper) {
        cached.wrapper.delete();
    }
    this._modelCache.delete(tempId);
    
    return result;
},

  getCorrelationWarning(designId = 'default') {
  if (!wasmReady) {
    return 0;
  }
  const cached = this._modelCache.get(designId);
  
  if (!cached || !cached.wrapper) {
    return 0;
  }
  const result = cached.wrapper.getCorrelationWarning();
  return result;
},

  calculateResults(design, options, designId = 'default') {
    if (!wasmReady) {
    // Return placeholder until WASM loads
    return {
      power: '---',
      dof: '---',
      se: '---',
      mde: '---',
      ciWidth: '---',
      error: 'WASM loading...'
    };
  }
    try {
      const wrapper = this._getWrapper(designId, design, options);
  console.log('Got wrapper, calling calculatePower...');
  const estimatorCode = this._getEstimatorCode(options.estimator);
  console.log('estimatorCode:', estimatorCode);
  
  const cv = options.sampleSizeMode === 'exact' ? 0 : (options.cvClusterSize ?? 0);
const result = wrapper.calculatePower(estimatorCode, cv);
  console.log('calculatePower returned:', result);
      
      if (!result.valid) {
        console.warn('Power calculation warning:', result.error);
        // Return placeholder values if calculation failed
        return {
          power: 'N/A',
          dof: 'N/A',
          se: 'N/A',
          mde: 'N/A',
          ciWidth: 'N/A',
          error: result.error
        };
      }
      
      return {
        power: result.power.toFixed(3),
        dof: Math.round(result.dof),
        se: result.se.toFixed(4),
        mde: result.mde.toFixed(4),
        ciWidth: result.ci_width.toFixed(4),
        error: null
      };
      
    } catch (err) {
      console.error('calculateResults error:', err);
      return {
        power: 'Error',
        dof: 'Error',
        se: 'Error',
        mde: 'Error',
        ciWidth: 'Error',
        error: err.message
      };
    }
  },

  calculateResultsWithClusters(design, options, totalClusters) {
  console.log('=== calculateResultsWithClusters START ===');
  console.log('totalClusters:', totalClusters);
  console.log('correlationStructure:', options.correlationStructure);
  console.log('samplingStructure:', options.samplingStructure);
  
  const originalClusters = [...design._clustersPerSequence];
  const currentTotal = design.getTotalClusters();
  const scale = totalClusters / currentTotal;
  
  const newClusters = originalClusters.map(c => Math.max(1, Math.round(c * scale)));
  
  console.log('originalClusters:', originalClusters);
  console.log('newClusters:', newClusters);
  console.log('scale:', scale);
    console.log('actual total after scaling:', newClusters.reduce((a, b) => a + b, 0));

  
  design._clustersPerSequence = newClusters;
  
  const tempId = `_plot_clusters_${totalClusters}`;
  console.log('tempId:', tempId);
  
  try {
    const result = this.calculateResults(design, options, tempId);
    design._clustersPerSequence = originalClusters;
    return result;
  } catch (err) {
    console.error('calculateResultsWithClusters error:', err);
    design._clustersPerSequence = originalClusters;
    throw err;
  }
},

  calculateSampleSize(design, meanClusterSize) {
  const grid = design.getGrid();
  for (let i = 0; i < design.numSequences; i++) {
    for (let j = 0; j < design.numPeriods; j++) {
      const cell = grid[i][j];
      if (cell.status !== CellStatus.NOT_ENROLLED) {
        cell.sampleSize = meanClusterSize;
      }
    }
  }
},

clearPlotCache() {
  for (const [key, cached] of this._modelCache) {
    if (key.startsWith('_plot_')) {
      if (cached.wrapper) {
        cached.wrapper.delete();
      }
      this._modelCache.delete(key);
    }
  }
},

calculateOptimalSequenceWeights(design, options = {}) {
  if (!wasmReady) {
    const n = design.numSequences;
    return Array(n).fill(1 / n);
  }

  
  
  const originalClusters = [...design._clustersPerSequence];
  design._clustersPerSequence = Array(design.numSequences).fill(1);
  
  const tempId = '_seq_weights_canonical';
  
  try {
    const wrapper = this._getWrapper(tempId, design, options);
    
    // Build sequence membership array (1 cluster per sequence)
    const sequenceMembership = [];
    const grid = design.getGrid();
    
    for (let seq = 0; seq < design.numSequences; seq++) {
      for (let t = 0; t < design.numPeriods; t++) {
        const cell = grid[seq][t];
        if (cell.status !== CellStatus.NOT_ENROLLED) {
          sequenceMembership.push(seq);  // Will be passed as double
        }
      }
    }
    
    // Use toWasmVector (doubles) instead of VectorInt
    const wasmSeqMem = toWasmVector(sequenceMembership);
    
    const maxIter = options.weightIterations ?? 100;
    const tol = options.weightTolerance ?? 1e-6;
    
    const result = wrapper.calculateOptimalSequenceWeights(wasmSeqMem, maxIter, tol);
    wasmSeqMem.delete();

    if (!result.valid) {
  console.warn('Optimal sequence weights failed:', result.error);
  design._clustersPerSequence = originalClusters;
  const n = design.numSequences;
  return Array(n).fill(1 / n);
}
    
    design._clustersPerSequence = originalClusters;
    
    if (!result.valid) {
      console.warn('Optimal sequence weights failed:', result.error);
      const n = design.numSequences;
      return Array(n).fill(1 / n);
    }
    
    console.log(`Optimal sequence weights converged in ${result.iterations} iterations`);
const weights = fromWasmVector(result.weights);
console.log('Sequence weights (raw):', weights);
const maxW = Math.max(...weights);
const normalized = maxW > 0 ? weights.map(w => w / maxW) : weights;
console.log('Sequence weights (normalized to max=1):', normalized);
return weights;
    
  } catch (err) {
    console.error('calculateOptimalSequenceWeights error:', err);
    design._clustersPerSequence = originalClusters;
    const n = design.numSequences;
    return Array(n).fill(1 / n);
  }
},

  calculateOptimalWeights(design, options = {}) {
    if (!wasmReady) {
    return this._getFallbackWeights(design);
  }
    try {
      const wrapper = this._getWrapper('_weights', design, options);
      const N = options.weightIterations ?? 100;
      
      const wasmWeights = wrapper.calculateOptimalWeights(N);
      const flatWeights = fromWasmVector(wasmWeights);
      
      // Reshape flat weights to grid format [sequences][periods]
      const grid = design.getGrid();
      const numSequences = design.numSequences;
      const numPeriods = design.numPeriods;
      
      const weights = [];
      let weightIdx = 0;
      
      for (let i = 0; i < numSequences; i++) {
        const nClusters = design.getClusters(i);
        const row = [];
        
        for (let j = 0; j < numPeriods; j++) {
          const cell = grid[i][j];
          if (cell.status === CellStatus.NOT_ENROLLED) {
            row.push(0);
          } else {
            // Average weights across clusters in this sequence
            let avgWeight = 0;
            for (let c = 0; c < nClusters; c++) {
              if (weightIdx < flatWeights.length) {
                avgWeight += flatWeights[weightIdx++];
              }
            }
            row.push(nClusters > 0 ? avgWeight / nClusters : 0);
          }
        }
        weights.push(row);
      }
      
      // Normalize to max = 1
      const maxWeight = Math.max(...weights.flat());
      if (maxWeight > 0) {
        for (let i = 0; i < numSequences; i++) {
          for (let j = 0; j < numPeriods; j++) {
            weights[i][j] = weights[i][j] / maxWeight;
          }
        }
      }
      
      return weights;
      
    } catch (err) {
      console.error('calculateOptimalWeights error:', err);
      // Return fallback weights
      return this._getFallbackWeights(design);
    }
  },

  

  // Fallback weights when WASM fails
  _getFallbackWeights(design) {
    const grid = design.getGrid();
    const weights = [];
    const numPeriods = design.numPeriods;
    const numSequences = design.numSequences;

    for (let i = 0; i < numSequences; i++) {
      const row = [];
      for (let j = 0; j < numPeriods; j++) {
        const cell = grid[i][j];
        if (cell.status === CellStatus.NOT_ENROLLED) {
          row.push(0);
        } else {
          // Simple placeholder weight
          const seqCenter = (numSequences - 1) / 2;
          const perCenter = (numPeriods - 1) / 2;
          const seqDist = 1 - Math.abs(i - seqCenter) / numSequences;
          const perDist = 1 - Math.abs(j - perCenter) / numPeriods;
          row.push(0.3 + 0.7 * seqDist * perDist);
        }
      }
      weights.push(row);
    }

    // Normalize
    const maxWeight = Math.max(...weights.flat());
    if (maxWeight > 0) {
      for (let i = 0; i < numSequences; i++) {
        for (let j = 0; j < numPeriods; j++) {
          weights[i][j] = weights[i][j] / maxWeight;
        }
      }
    }

    return weights;
  },

  // Clear cache (useful when switching between designs)
  clearCache() {
    // Clean up WASM wrappers
    for (const [, cached] of this._modelCache) {
      if (cached.wrapper) {
        cached.wrapper.delete();
      }
    }
    this._modelCache.clear();
  },

  // Debug: get generated data and formula
  debug(design, options) {
    const dataMatrix = this._generateDataMatrix(design, options);
    return {
      dataMatrix,
      formula: this._buildFormula(design, options),
      family: this._getFamily(options.outcomeType),
      link: this._getLink(options.outcomeType),
      colnames: this._colnames,
      meanN: this._getMeanN(dataMatrix),
      hash: this._getDesignHash(design)
    };
  },

  // Get wrapper info for debugging
  getWrapperInfo(designId = 'default') {
    if (!wasmReady) {
    throw new Error('WASM not initialized. Call MathsInterface.initialize() first.');
  }

  const hash = this._getDesignHash(design);
    const cached = this._modelCache.get(designId);
    console.log('_getWrapper:', { designId, hash, hasCached: !!cached, cachedHash: cached?.hash });

  if (cached && cached.hash === hash) {
    console.log('Reusing cached wrapper, updating parameters...');
  this._updateWrapperParameters(cached.wrapper, options, cached.meanN, design.numPeriods);
    return cached.wrapper;
  }

  console.log('Creating new wrapper...');
    if (!cached || !cached.wrapper) {
      return null;
    }
    return {
      formula: cached.wrapper.getFormula(),
      totalN: cached.wrapper.getTotalN(),
      totalClusterPeriods: cached.wrapper.getTotalClusterPeriods(),
      nClusters: cached.wrapper.getNClusters(),
      numParameters: cached.wrapper.getNumParameters(),
      isValid: cached.wrapper.isValid(),
      lastError: cached.wrapper.getLastError(),
      dataRows: cached.wrapper.getDataRows(),
      dataCols: cached.wrapper.getDataCols()
    };
  }
};

const createDefaultOptions = () => ({
  // Outcome
  outcomeType: 'continuous',  // 'continuous', 'binary', 'count'
  
  // Treatment effect
  treatmentEffect: 0.5,
  baseline: 0.5,
  
  // Cluster parameters
  meanClusterSize: 20,
  cvClusterSize: 0.0,
  
  // Correlation parameters
  icc: 0.05,
  iac: 0.0,
  cac: 0.8,
  temporalCorrelation: 0.8,
  replacementRate: 0.5,
  // Structure
  correlationStructure: 'exchangeable',  // 'exchangeable', 'nested_exchangeable', 'exponential_decay', 'autoregressive'
  samplingStructure: 'cross_section',    // 'cross_section', 'closed_cohort', 'open_cohort'
  individualCovariance: 'exchangeable',
  
  // Analysis
  estimator: 'mixed_model',  // 'mixed_model', 'mixed_model_ttest', 'satterthwaite', 'kenward_roger', 'gee_independence', 'gee_independence_robust'
  alpha: 0.05,
  targetPower: 0.80,
  
  // Model
  includeIntercept: true,
  timeEffect: 'fixed_effects',  // 'fixed_effects', 'linear'
  heterogeneousTe: false,
  twoTreatments: false
});

const createDesignEntry = (name, preset = "parallel") => {
  let design;
  switch (preset) {
    case "parallel":
      design = TrialDesign.createParallel(2, 1);
      design._clustersPerSequence = design._clustersPerSequence.map(() => 10);
      break;
    case "parallel-baseline":
      design = TrialDesign.createParallelBaseline(2, 2);
      break;
    case "stepped-wedge":
      design = TrialDesign.createSteppedWedge(4, 5);
      break;
    case "stepped-wedge-implementation":
      design = TrialDesign.createSteppedWedgeImplementation(4, 6);
      break;
    case "crossover":
      design = TrialDesign.createCrossover(2, 2, false);
      break;
    case "crossover-washout":
      design = TrialDesign.createCrossover(2, 2, true);
      break;
    case "staircase":
      design = TrialDesign.createStaircase(4, 5);
      break;
    default:
      design = TrialDesign.createSteppedWedge(4, 5);
  }
  MathsInterface.calculateSampleSize(design, 20);
  return {
    name,
    design,
    options: createDefaultOptions(),
  };
};

// === UI COMPONENTS ===

const statusConfig = {
  [CellStatus.CONTROL]: {
    label: "Control",
    shortLabel: "C",
    bg: "bg-ctrl",
    border: "border-ctrl-line",
    text: "text-ink-700",
    hoverBg: "hover:bg-ctrl-hover",
  },
  [CellStatus.INTERVENTION]: {
    label: "Intervention",
    shortLabel: "I",
    bg: "bg-arm-500",
    border: "border-arm-700",
    text: "text-white",
    hoverBg: "hover:bg-arm-600",
  },
  [CellStatus.NOT_ENROLLED]: {
    label: "Not enrolled",
    shortLabel: "—",
    bg: "bg-white cell-off",
    border: "border-ink-400 border-dashed",
    text: "text-ink-500",
    hoverBg: "hover:border-ink-600",
  },
};

const statusCycle = [
  CellStatus.CONTROL,
  CellStatus.INTERVENTION,
  CellStatus.NOT_ENROLLED,
];

const designColors = [
  {
    bg: "bg-arm-600",
    text: "text-arm-700",
    light: "bg-arm-50",
    border: "border-arm-600",
    hex: "#0d6d78",
  },
  {
    bg: "bg-vermilion-500",
    text: "text-vermilion-600",
    light: "bg-vermilion-50",
    border: "border-vermilion-500",
    hex: "#d4572a",
  },
  {
    bg: "bg-gold-500",
    text: "text-gold-700",
    light: "bg-gold-50",
    border: "border-gold-500",
    hex: "#b8890f",
  },
];

// Drawn icon set: 16px grid, 1.6 stroke, round joins. One family, no emoji.
const ICON_PATHS = {
  download: "M8 2.5v8M4.75 7.5 8 10.75 11.25 7.5M3 13.5h10",
  upload: "M8 10.75v-8M4.75 5.75 8 2.5l3.25 3.25M3 13.5h10",
  refresh: "M13.25 8a5.25 5.25 0 1 1-1.54-3.71M13.25 2.75v2.5h-2.5",
  check: "M3.5 8.5 6.5 11.5 12.5 4.5",
  alert: "M8 2.25 14.25 13.25H1.75L8 2.25ZM8 6.5v3M8 11.4v.1",
  info: "M8 14.25A6.25 6.25 0 1 0 8 1.75a6.25 6.25 0 0 0 0 12.5ZM8 7.25v4M8 4.9v.1",
  plus: "M8 3.5v9M3.5 8h9",
  close: "M4.5 4.5l7 7M11.5 4.5l-7 7",
  bundle: "M2.75 5 8 2.25 13.25 5v6L8 13.75 2.75 11V5ZM2.75 5 8 7.75 13.25 5M8 7.75v6",
  image: "M2.75 3.25h10.5v9.5H2.75zM2.75 10.5l3-3 2.5 2.5 1.75-1.75 3.25 3.25M10.25 6.25v.1",
};

const Icon = ({ name, className = "w-4 h-4" }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`shrink-0 ${className}`}
    aria-hidden="true"
  >
    <path d={ICON_PATHS[name]} />
  </svg>
);

const SEQ_HEADER_W = 84; // cluster-count input + row label

const NumericInput = ({ value, onChange, min, max, step, className }) => {
  const [raw, setRaw] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setRaw(String(value));
  }, [value, focused]);

  return (
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      value={focused ? raw : value}
      onChange={(e) => setRaw(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const parsed = parseFloat(raw);
        if (isNaN(parsed)) {
          onChange(min ?? 0);
        } else {
          let clamped = parsed;
          if (min != null) clamped = Math.max(min, clamped);
          if (max != null) clamped = Math.min(max, clamped);
          onChange(clamped);
        }
      }}
      className={className}
    />
  );
};

// Keep floating panels inside the viewport.
const clampToViewport = (x, y, w, h) => ({
  left: Math.max(8, Math.min(x, window.innerWidth - w - 8)),
  top: Math.max(8, Math.min(y, window.innerHeight - h - 8)),
});

const ContextMenu = ({ x, y, items, onClose }) => {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed bg-white rounded-md shadow-pop border border-ink-200 py-1 z-50 min-w-[180px]"
      style={clampToViewport(
        x,
        y,
        180,
        items.reduce((h, it) => h + (it.separator ? 9 : 32), 8)
      )}
    >
      {items.map((item, idx) =>
        item.separator ? (
          <div key={idx} className="h-px bg-ink-200 my-1" />
        ) : (
          <button
            key={idx}
            onClick={() => {
              item.action();
              onClose();
            }}
            disabled={item.disabled}
            role="menuitem"
            className={`w-full text-left px-3 py-1.5 text-sm transition-colors
              ${
                item.disabled
                  ? "text-ink-300 cursor-not-allowed"
                  : "text-ink-800 hover:bg-ink-50"
              }
              ${
                item.danger && !item.disabled
                  ? "text-red-600 hover:bg-red-50"
                  : ""
              }
            `}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  );
};

const CellSizeEditor = ({ x, y, initial, onSave, onClose }) => {
  const formRef = useRef(null);
  const inputRef = useRef(null);
  const [value, setValue] = useState(String(initial));

  useEffect(() => {
    inputRef.current?.select();
    const handleClickOutside = (e) => {
      if (formRef.current && !formRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const parsed = parseInt(value, 10);
  const valid = !isNaN(parsed) && parsed > 0;

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSave(parsed);
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="fixed z-50 w-60 bg-white border border-ink-200 rounded-md shadow-pop p-3"
      style={clampToViewport(x, y, 240, 112)}
    >
      <label htmlFor="cell-size-input" className="field-label mb-1.5">
        Cluster-period size
      </label>
      <div className="flex gap-2">
        <input
          id="cell-size-input"
          ref={inputRef}
          type="number"
          min="1"
          step="1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={!valid}
          className={`field flex-1 w-0 ${
            valid ? "" : "border-red-400 focus:border-red-500 focus:ring-red-100"
          }`}
        />
        <button type="submit" disabled={!valid} className="btn btn-primary">
          Set
        </button>
      </div>
      <p className={`mt-1.5 text-xs ${valid ? "text-ink-500" : "text-red-700"}`}>
        {valid ? "Enter to set, Esc to cancel." : "Enter a whole number above 0."}
      </p>
    </form>
  );
};

const InsertButton = ({ onClick, className = "" }) => (
  <button
    onClick={onClick}
    className={`
      flex items-center justify-center
      bg-accent-600 text-white rounded-full
      opacity-0 group-hover:opacity-100 focus:opacity-100
      transition-opacity duration-150
      hover:bg-accent-700
      focus:outline-none focus:ring-2 focus:ring-accent-300 focus:ring-offset-1
      w-4 h-4
      ${className}
    `}
    aria-label="Insert"
  >
    <Icon name="plus" className="w-3 h-3" />
  </button>
);

const PeriodHeader = ({ index, onContextMenu, cellSize }) => (
  <div
    className="flex items-center justify-center font-mono text-xs text-ink-500
               cursor-context-menu select-none hover:bg-ink-100 hover:text-ink-900 rounded transition-colors"
    style={{ width: cellSize, height: 32 }}
    onContextMenu={(e) => {
      e.preventDefault();
      onContextMenu(e, index);
    }}
    title="Right-click for options"
  >
    T{index}
  </div>
);

const SequenceHeader = ({
  index,
  clusters,
  onClustersChange,
  onContextMenu,
  cellSize,
}) => (
  <div
    className="flex items-center justify-end gap-2 pr-2"
    style={{ width: SEQ_HEADER_W, height: cellSize }}
  >
    <input
      type="number"
      min="1"
      value={clusters}
      onChange={(e) => onClustersChange(index, parseInt(e.target.value) || 1)}
      className="field field-sm w-12 text-center"
      title="Number of clusters"
    />
    <div
      className="font-mono text-xs text-ink-500 whitespace-nowrap cursor-context-menu select-none
                 hover:bg-ink-100 hover:text-ink-900 rounded px-1 py-0.5 transition-colors"
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, index);
      }}
      title="Right-click for options"
    >
      S{index + 1}
    </div>
  </div>
);

const DesignCellComponent = ({
  cell,
  rowIndex,
  colIndex,
  onClick,
  onContextMenu,
  cellSize,
  sampleSizeMode,
  scale = 1,
}) => {
  const config = statusConfig[cell.status];
  const scaledSize = cellSize * (0.4 + 0.6 * scale); // Min 40% size

  return (
    <div
      className="flex items-center justify-center"
      style={{ width: cellSize, height: cellSize }}
    >
      <button
        onClick={() => onClick(rowIndex, colIndex)}
        onContextMenu={(e) => onContextMenu(e, rowIndex, colIndex)}
        className={`
          ${config.bg} ${config.border} ${config.text} ${config.hoverBg}
          border-[1.5px] rounded-md transition-[width,height] duration-300 ease-out
          focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-1
          flex flex-col items-center justify-center
        `}
        style={{
          width: scaledSize,
          height: scaledSize,
          fontSize: `${Math.max(0.6, scale) * 100}%`,
        }}
        title={`${config.label}${
          sampleSizeMode === "exact" && cell.sampleSize
            ? ` (n=${cell.sampleSize})`
            : ""
        }${scale < 1 ? ` (weight: ${(scale * 100).toFixed(0)}%)` : ""}${
          sampleSizeMode === "exact" && cell.status !== CellStatus.NOT_ENROLLED
            ? " — Right-click to set size"
            : ""
        }`}
      >
        {sampleSizeMode === "exact" &&
          cell.sampleSize !== null &&
          cell.status !== CellStatus.NOT_ENROLLED && (
            <span className="font-mono font-medium text-xs tabular-nums">n={cell.sampleSize}</span>
          )}
        <span className="font-mono text-[10px] font-semibold">
          {config.shortLabel}
        </span>
      </button>
    </div>
  );
};

// Results Table Component
const RESULT_ROWS = [
  { key: "power", label: "Power" },
  { key: "dof", label: "Degrees of freedom" },
  { key: "se", label: "Standard error" },
  { key: "mde", label: "Minimum detectable effect" },
];

const ResultsTable = ({
  designs,
  cachedResults,
  isStale,
  isCalculating,
  onRecalculate,
  onExportBundle,
  isExporting,
}) => {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Results</h2>
        {isStale && (
          <button
            onClick={onRecalculate}
            disabled={isCalculating}
            className="btn btn-primary btn-sm"
          >
            <Icon
              name="refresh"
              className={`w-3.5 h-3.5 ${isCalculating ? "animate-spin" : ""}`}
            />
            {isCalculating ? "Calculating…" : "Recalculate"}
          </button>
        )}
      </div>
      <div className="overflow-x-auto px-4 py-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200">
              <th className="text-left py-2 pr-3 text-xs font-medium text-ink-500">
                Metric
              </th>
              {designs.map((d, i) => (
                <th
                  key={i}
                  className="text-right py-2 pl-3 text-xs font-semibold text-ink-800 whitespace-nowrap"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${designColors[i].bg}`}
                    />
                    {d.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            className={`transition-colors ${
              isStale ? "text-ink-400" : "text-ink-900"
            }`}
          >
            {RESULT_ROWS.map((row, r) => (
              <tr
                key={row.key}
                className={r < RESULT_ROWS.length - 1 ? "border-b border-ink-100" : ""}
              >
                <td className="py-1.5 pr-3 text-ink-600">{row.label}</td>
                {cachedResults.map((res, i) => (
                  <td
                    key={i}
                    className={`text-right py-1.5 pl-3 font-mono tabular-nums ${
                      row.key === "power" ? "font-medium" : ""
                    }`}
                  >
                    {res[row.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isStale && !isCalculating && (
        <p className="flex items-center gap-1.5 px-4 py-2 border-t border-amber-100 text-xs text-amber-800 bg-amber-50">
          <Icon name="alert" className="w-3.5 h-3.5" />
          These results are out of date. Recalculate to update them.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 border-t border-ink-100 bg-ink-50 rounded-b-lg">
        <p className="text-xs leading-snug text-ink-600 max-w-[34ch]">
          <span className="block text-sm font-semibold text-ink-900">Verification report</span>
          Matrices, an R verification script and documentation for regulatory review.
        </p>
        <button
          onClick={onExportBundle}
          disabled={isExporting || isStale}
          className="btn btn-primary"
        >
          <Icon
            name={isExporting ? "refresh" : "bundle"}
            className={`w-4 h-4 ${isExporting ? "animate-spin" : ""}`}
          />
          {isExporting ? "Generating…" : "Export verification bundle"}
        </button>
      </div>
    </section>
  );
};

// Power Warning Component
const PowerWarning = ({ warning, selectedEstimator, designName }) => {
  if (!warning) return null;
  
  const estimatorLabels = {
    mixed_model: 'Model-based',
    mixed_model_ttest: 'Model-based t-test',
    satterthwaite: 'Satterthwaite',
    kenward_roger: 'Kenward-Roger',
    gee_independence: 'GEE Independence',
    gee_independence_robust: 'GEE Independence Robust',
    gee_exchangeable: 'GEE Exchangeable Robust',
    gee_exchangeable_ttest: 'GEE Exchangeable Robust t-test',
    design_effect: 'Design Effect',
    design_effect_ttest: 'Design Effect t-test'
  };
  
  const isRobust = ['gee_exchangeable', 'gee_independence_robust', 'gee_exchangeable_ttest'].includes(selectedEstimator);
  const isSmallSampleCorrected = ['satterthwaite', 'kenward_roger', 'mixed_model_ttest', 'gee_exchangeable_ttest', 'design_effect_ttest'].includes(selectedEstimator);
  
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
      <div className="flex items-start gap-2.5">
        <Icon name="alert" className="w-4 h-4 mt-0.5 text-amber-600" />
        <div className="flex-1">
          <p className="font-semibold text-amber-900 mb-1.5">
            Power estimate may be optimistic
          </p>
          <p className="text-amber-800 mb-2">
            The selected estimator for {designName} ({estimatorLabels[selectedEstimator]}) shows power of{' '}
            <span className="font-mono font-semibold">{(warning.selectedPower * 100).toFixed(1)}%</span>, 
            which is more than 10 percentage points higher than{' '}
            {warning.lowEstimators.length === 1 
              ? estimatorLabels[warning.lowEstimators[0].key]
              : `${warning.lowEstimators.length} other estimators`
            }{' '}
            (lowest: <span className="font-mono font-semibold">{(warning.minOtherPower * 100).toFixed(1)}%</span>).
          </p>
          <p className="text-amber-800">
            {!isSmallSampleCorrected && !isRobust && (
              <>Consider using a small sample correction (Satterthwaite or Kenward-Roger) or robust covariance estimation (GEE Exchangeable Robust) for more conservative estimates.</>
            )}
            {isSmallSampleCorrected && !isRobust && (
              <>You are using a small sample correction. Consider also comparing with robust covariance estimation (GEE Exchangeable Robust).</>
            )}
            {isRobust && !isSmallSampleCorrected && (
              <>You are using robust covariance estimation. Consider also comparing with small sample corrections (Satterthwaite or Kenward-Roger).</>
            )}
            {isRobust && isSmallSampleCorrected && (
              <>This estimator already includes corrections. The difference may reflect genuine variation in power across inference approaches for this design.</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

const CorrelationWarning = ({ warningCode }) => {
  if (!warningCode || warningCode === 0) return null;
  
  const isSevere = warningCode > 1;
  
  return (
    <div className={`${isSevere ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'} border rounded-lg p-4 text-sm`}>
      <div className="flex items-start gap-2.5">
        <Icon name="alert" className={`w-4 h-4 mt-0.5 ${isSevere ? 'text-red-600' : 'text-amber-600'}`} />
        <div className="flex-1">
          <p className={`font-semibold ${isSevere ? 'text-red-900' : 'text-amber-900'} mb-1.5`}>
            {warningCode === 1 && 'Correlation parameters require high random effect variance'}
            {warningCode === 2 && 'Correlation parameters may not be realistic'}
            {warningCode === 3 && 'Could not solve for valid model parameters'}
          </p>
          <p className={isSevere ? 'text-red-800' : 'text-amber-800'}>
            {warningCode === 1 && (
              <>
                The specified ICC/IAC combination requires moderately high random effect variance 
                in the underlying GLMM. For binomial models this may mean differences in power for 
                marginal (GLMM) and conditional (GEE) models, compare the estimators in the menu. {' '}
                <a 
                  href="https://github.com/samuel-watson/ClusterApp2/blob/master/solver.md" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 font-medium hover:no-underline"
                >
                  Learn more
                </a>
              </>
            )}
            {warningCode === 2 && (
              <>
                The specified ICC/IAC combination requires extreme random effect variance. 
                This implies most individuals have near-deterministic outcomes (always respond 
                or never respond), with the marginal prevalence arising from the population mix 
                rather than individual-level uncertainty. Consider reducing IAC or increasing ICC 
                for more realistic modelling assumptions. For binomial models this will mean differences in power for 
                marginal (GLMM) and conditional (GEE) models, compare the estimators in the menu. {' '}
                <a 
                  href="https://github.com/samuel-watson/ClusterApp2/blob/master/solver.md" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 font-medium hover:no-underline"
                >
                  Learn more
                </a>
              </>
            )}
            {warningCode === 3 && (
              <>
                The solver could not find valid GLMM parameters matching the specified ICC and IAC. 
                This combination is not likely to be achievable in a mixed model. This may arise if the 
                correlation parameters imply most individuals have near-deterministic outcomes (always respond 
                or never respond), with the marginal prevalence arising from the population mix 
                rather than individual-level uncertainty. Power calculations are unreliable. {' '}
                <a 
                  href="https://github.com/samuel-watson/ClusterApp2/blob/master/solver.md" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 font-medium hover:no-underline"
                >
                  Learn more
                </a>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

// Plot Component using Plotly via CDN
const PlotArea = ({
  designs,
  activeIndex,
  cachedResults,
  isStale,
  isCalculating,
  cacheVersion,
}) => {
  const plotRef = useRef(null);
  const [plotlyLoaded, setPlotlyLoaded] = useState(false);
  const [xAxis, setXAxis] = useState("icc");
  const [yAxis, setYAxis] = useState("power");
  const [plotType, setPlotType] = useState("line"); // 'line', 'heatmap', or 'contour'
  const [targetPower, setTargetPower] = useState(0.8);
  const [surfaceResolution, setSurfaceResolution] = useState(10);

  const xAxisOptions = [
    { value: "icc", label: "ICC", min: 0, max: 0.3, steps: 30 },
    {
      value: "meanClusterSize",
      label: "Cluster-period size",
      min: 5,
      max: 100,
      steps: 30,
    },
    {
      value: "treatmentEffect",
      label: "Treatment effect",
      min: 0,
      max: 2,
      steps: 30,
    },
    { value: "baseline", label: "Baseline", min: 0.01, max: 0.5, steps: 30 },
    {
      value: "totalClusters",
      label: "Total clusters",
      min: 2,
      max: 50,
      steps: 30,
    },
  ];

  const yAxisOptions = [
    { value: "power", label: "Power" },
    { value: "mde", label: "Min. detectable effect" },
  ];

  // Load Plotly from CDN
  useEffect(() => {
    if (window.Plotly) {
      setPlotlyLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.plot.ly/plotly-2.27.0.min.js";
    script.async = true;
    script.onload = () => setPlotlyLoaded(true);
    document.head.appendChild(script);

    return () => {
      // Cleanup if needed
    };
  }, []);

  const [customRange, setCustomRange] = useState(null);

useEffect(() => {
  setCustomRange(null);
}, [xAxis]);

const currentXConfig = useMemo(() => {
  const base = xAxisOptions.find((o) => o.value === xAxis);
  if (customRange) {
    return { ...base, min: customRange.min, max: customRange.max };
  }
  return base;
}, [xAxis, customRange]);

  // Generate plot data
  const plotData = useMemo(() => {
   
  if (!currentXConfig) {
    console.log('No currentXConfig');
    return [];
  }

  console.log('Generating plot data:', { xAxis, currentXConfig });

  // Clear old plot cache
  MathsInterface.clearPlotCache();

  return designs.map((d, idx) => {
    const xValues = [];
    const yValues = [];

    const { min, max, steps } = currentXConfig;
    console.log('Plot range:', { min, max, steps });

    for (let i = 0; i <= steps; i++) {
      const xVal = min + (max - min) * (i / steps);
      xValues.push(xVal);

      const modifiedOptions = { ...d.options };
      let result;

      if (xAxis === "totalClusters") {
        result = MathsInterface.calculateResultsWithClusters(
          d.design,
          modifiedOptions,
          Math.round(xVal)
        );
      } else if (xAxis === "meanClusterSize") {
  modifiedOptions.meanClusterSize = xVal;
  const tempId = `_plot_line_${idx}`;  // ✓ Same ID = reuse model, update weights
  result = MathsInterface.calculateResults(d.design, modifiedOptions, tempId);
} else {
        modifiedOptions[xAxis] = xVal;
  // Use design-specific ID so different designs don't share cache
  const tempId = `_plot_line_${idx}`;
  result = MathsInterface.calculateResults(d.design, modifiedOptions, tempId);
      }

      // Debug first and last iteration
      if (i === 0 || i === steps) {
        console.log(`Point ${i}: x=${xVal}, ${xAxis}=${modifiedOptions[xAxis]}, power=${result.power}`);
      }

      yValues.push(parseFloat(yAxis === "power" ? result.power : result.mde));
    }

    console.log('Y values range:', Math.min(...yValues), 'to', Math.max(...yValues));

      return {
        x: xValues,
        y: yValues,
        type: "scatter",
        mode: "lines",
        name: d.name,
        line: {
          color: designColors[idx].hex,
          width: 2.5,
          dash: ["solid", "dash", "dot"][idx],
        },
      };
    });
  }, [cacheVersion, xAxis, yAxis, currentXConfig]);

  const surfaceData = useMemo(() => {
  if (plotType === "line") return null;

  MathsInterface.clearPlotCache();
  // Use active design instead of first design
  const d = designs[activeIndex];
  
  const clusterSizes = Array.from({ length: surfaceResolution }, (_, i) => 
    5 + i * Math.floor(100 / surfaceResolution)
  );
  const totalClusters = Array.from({ length: surfaceResolution }, (_, i) => 
    2 + i * Math.floor(50 / surfaceResolution)
  );

  const zValues = totalClusters.map((clusters) => {
    return clusterSizes.map((size) => {
      const modifiedOptions = { ...d.options, meanClusterSize: size };
      const result = MathsInterface.calculateResultsWithClusters(
        d.design,
        modifiedOptions,
        clusters
      );
      return parseFloat(result.power);
    });
  });

  return {
    x: clusterSizes,
    y: totalClusters,
    z: zValues,
    type: plotType,
    colorscale: [
      [0, "#f7d9cc"],
      [Math.max(0.01, targetPower - 0.2), "#f6f0e3"],
      [targetPower, "#a6d8dc"],
      [1, "#0b5862"],
    ],
    contours:
      plotType === "contour"
        ? {
            coloring: "heatmap",
            showlabels: true,
            labelfont: { size: 10, color: "#353a41" },
          }
        : undefined,
    hovertemplate:
      "Size: %{x}<br>Clusters: %{y}<br>Power: %{z:.3f}<extra></extra>",
    colorbar: {
      title: { text: "Power", font: { size: 11, color: "#4b5159" } },
      tickfont: { size: 10, color: "#4b5159" },
      outlinewidth: 0,
    },
  };
}, [
  cacheVersion, 
  plotType, 
  activeIndex, 
  targetPower, 
  surfaceResolution
]);

  // Render plot when data or Plotly changes
  useEffect(() => {
    if (!plotlyLoaded || !plotRef.current || !window.Plotly) return;

    let data, layout;

    if (plotType === "line") {
      const shapes =
        yAxis === "power"
          ? [
              {
                type: "line",
                x0: currentXConfig.min,
                x1: currentXConfig.max,
                y0: targetPower,
                y1: targetPower,
                line: { color: "#868d96", width: 1.25, dash: "dot" },
              },
            ]
          : [];

      data = plotData;
      layout = {
        margin: { l: 55, r: 20, t: 36, b: 46 },
        xaxis: {
          title: { text: currentXConfig.label, font: { size: 12, color: "#4b5159" } },
          gridcolor: "#e7eaee",
          linecolor: "#c4c9cf",
          zeroline: false,
          tickfont: { size: 10, color: "#636a73" },
        },
        yaxis: {
          title: {
            text: yAxis === "power" ? "Power" : "Min. detectable effect",
            font: { size: 12, color: "#4b5159" },
          },
          gridcolor: "#e7eaee",
          linecolor: "#c4c9cf",
          zeroline: false,
          range: yAxis === "power" ? [0, 1.02] : undefined,
          tickfont: { size: 10, color: "#636a73" },
        },
        shapes: shapes,
        legend: {
          orientation: "h",
          y: 1.02,
          yanchor: "bottom",
          x: 0,
          xanchor: "left",
          font: { size: 12, color: "#353a41" },
        },
        paper_bgcolor: "white",
        plot_bgcolor: "white",
        font: { family: '"Source Sans 3", system-ui, sans-serif', color: "#353a41" },
        hoverlabel: { bgcolor: "#22262b", bordercolor: "#22262b", font: { color: "#eef0f2", size: 12 } },
        hovermode: "x unified",
      };
    } else {
      // Heatmap or contour
      data = [surfaceData];
      layout = {
        margin: { l: 55, r: 80, t: 25, b: 50 },
        xaxis: {
          title: { text: "Cluster-period size", font: { size: 12, color: "#4b5159" } },
          tickfont: { size: 10, color: "#636a73" },
        },
        yaxis: {
          title: { text: "Total clusters", font: { size: 12, color: "#4b5159" } },
          tickfont: { size: 10, color: "#636a73" },
        },
        paper_bgcolor: "white",
        font: { family: '"Source Sans 3", system-ui, sans-serif', color: "#353a41" },
        hoverlabel: { bgcolor: "#22262b", bordercolor: "#22262b", font: { color: "#eef0f2", size: 12 } },
        annotations:
          plotType === "contour"
            ? [
                {
                  x: surfaceData.x[Math.floor(surfaceData.x.length * 0.7)],
                  y: surfaceData.y[Math.floor(surfaceData.y.length * 0.3)],
                  text: `${(targetPower * 100).toFixed(0)}% power`,
                  showarrow: false,
                  font: { size: 10, color: "#353a41" },
                },
              ]
            : [],
      };
    }

    const config = {
      responsive: true,
      displayModeBar: "hover",
      modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"],
      toImageButtonOptions: {
        format: "png",
        filename: "power_analysis",
        height: 600,
        width: 900,
        scale: 2,
      },
      displaylogo: false,
    };

    window.Plotly.newPlot(plotRef.current, data, layout, config);

    return () => {
      if (plotRef.current && window.Plotly) {
        window.Plotly.purge(plotRef.current);
      }
    };
  }, [
    plotlyLoaded,
    plotData,
    surfaceData,
    plotType,
    yAxis,
    currentXConfig,
    targetPower,
    cacheVersion,
  ]);

  // Keep the plot filling its panel as the neighbouring column changes height.
  useEffect(() => {
    if (!plotlyLoaded || !plotRef.current || !window.ResizeObserver) return;
    const el = plotRef.current;
    const ro = new ResizeObserver(() => {
      if (window.Plotly && el.data) window.Plotly.Plots.resize(el);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [plotlyLoaded]);

  const exportPlot = (format) => {
    if (!plotRef.current || !window.Plotly) return;

    window.Plotly.downloadImage(plotRef.current, {
      format: format,
      filename: "power_analysis",
      height: 600,
      width: 900,
      scale: 2,
    });
  };

  return (
    <section className="panel flex-1 flex flex-col">
      <div className="panel-head">
        <h2 className="panel-title">Analysis plot</h2>
        <div className="flex gap-1.5">
          <button
            onClick={() => exportPlot("png")}
            className="btn btn-secondary btn-sm"
            title="Download as PNG"
          >
            <Icon name="download" className="w-3.5 h-3.5" />
            PNG
          </button>
          <button
            onClick={() => exportPlot("svg")}
            className="btn btn-secondary btn-sm"
            title="Download as SVG"
          >
            <Icon name="download" className="w-3.5 h-3.5" />
            SVG
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-2.5 gap-y-2.5 px-4 pt-3">
        <label className="flex flex-col gap-1">
          <span className="field-label">Plot</span>
          <select
            value={plotType}
            onChange={(e) => setPlotType(e.target.value)}
            className="field field-sm w-28"
          >
            <option value="line">Line</option>
            <option value="heatmap">Heatmap</option>
            <option value="contour">Contour</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="field-label" title="Target power">Target</span>
          <input
            type="number"
            step="0.05"
            min="0.5"
            max="0.99"
            value={targetPower}
            onChange={(e) =>
              setTargetPower(
                Math.min(0.99, Math.max(0.5, parseFloat(e.target.value) || 0.8))
              )
            }
            className="field field-sm w-12 text-center"
          />
        </label>

        {plotType === "line" && (
          <>
            <label className="flex flex-col gap-1">
              <span className="field-label">X axis</span>
              <select
                value={xAxis}
                onChange={(e) => setXAxis(e.target.value)}
                className="field field-sm w-[7.5rem]"
              >
                {xAxisOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col gap-1">
              <span className="field-label">Range</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  aria-label="Range minimum"
                  value={customRange?.min ?? currentXConfig?.min ?? 0}
                  onChange={(e) =>
                    setCustomRange((r) => ({
                      min: parseFloat(e.target.value),
                      max: r?.max ?? currentXConfig?.max ?? 1,
                    }))
                  }
                  className="field field-sm w-12 text-center"
                />
                <span className="text-xs text-ink-500">–</span>
                <input
                  type="number"
                  aria-label="Range maximum"
                  value={customRange?.max ?? currentXConfig?.max ?? 1}
                  onChange={(e) =>
                    setCustomRange((r) => ({
                      min: r?.min ?? currentXConfig?.min ?? 0,
                      max: parseFloat(e.target.value),
                    }))
                  }
                  className="field field-sm w-12 text-center"
                />
              </div>
            </div>

            <label className="flex flex-col gap-1">
              <span className="field-label">Y axis</span>
              <select
                value={yAxis}
                onChange={(e) => setYAxis(e.target.value)}
                className="field field-sm w-[7.5rem]"
              >
                {yAxisOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {plotType !== "line" && (
          <>
            <label className="flex flex-col gap-1">
              <span className="field-label">Resolution</span>
              <input
                type="number"
                min="5"
                max="30"
                value={surfaceResolution}
                onChange={(e) =>
                  setSurfaceResolution(
                    Math.min(30, Math.max(5, parseInt(e.target.value) || 15))
                  )
                }
                className="field field-sm w-14 text-center"
              />
            </label>
            <span className="text-xs text-ink-500 pb-1.5">
              Showing {designs[activeIndex].name}
            </span>
          </>
        )}
      </div>

      <div className="relative flex-1 min-h-[280px] mx-2 mb-2 mt-1">
        {isStale && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <span className="bg-white border border-amber-200 text-amber-800 text-xs font-medium px-2.5 py-1 rounded-md shadow-card">
              Out of date
            </span>
          </div>
        )}
        <div className={`absolute inset-0 transition-opacity ${isStale ? "opacity-40" : ""}`}>
          {!plotlyLoaded ? (
            <div className="h-full flex items-center justify-center text-sm text-ink-500">
              Loading plot library…
            </div>
          ) : (
            <div ref={plotRef} className="w-full h-full" />
          )}
        </div>
      </div>
    </section>
  );
};



// === MAIN COMPONENT ===

function App() {
  const [designs, setDesigns] = useState(() => [createDesignEntry("Design 1")]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [contextMenu, setContextMenu] = useState(null);
  const [cellEditor, setCellEditor] = useState(null);
  const [cellSize, setCellSize] = useState(72);
  const [weightMode, setWeightMode] = useState('none'); // 'none', 'cell', 'row'
const [rowWeights, setRowWeights] = useState(null);
  const designGridRef = useRef(null);
  const [resultsStale, setResultsStale] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [cachedResults, setCachedResults] = useState(() =>
    designs.map((d, i) => MathsInterface.calculateResults(d.design, d.options, `design-${i}`))
  );
  const [cacheVersion, setCacheVersion] = useState(0);
  const [cachedWeights, setCachedWeights] = useState(() =>
  designs.map((d) => ({
    cell: MathsInterface.calculateOptimalWeights(d.design),
    row: Array(d.design.numSequences).fill(1)
  }))
);
  const [wasmLoaded, setWasmLoaded] = useState(false);
  const [isExporting, setIsExporting] = useState(false);  
  const activeDesign = designs[activeIndex];
  const design = activeDesign.design;
  const options = activeDesign.options;

  const weights = weightMode !== 'none' ? cachedWeights[activeIndex] || null : null;
  // List of all estimators for comparison
const getEstimators = (outcomeType) => {
  if (outcomeType === 'binary' || outcomeType === 'count') {
    return [
      { key: 'mixed_model', label: 'GLMM (Conditional)' },
      { key: 'mixed_model_ttest', label: 'GLMM (Conditional), t-test' },
      { key: 'satterthwaite', label: 'GLMM (Conditional), Satterthwaite' },
      { key: 'kenward_roger', label: 'GLMM (Conditional), Kenward-Roger' },
      { key: 'gee_exchangeable', label: 'GEE (Marginal; Robust)' },
      { key: 'gee_exchangeable_ttest', label: 'GEE (Marginal; Robust), t-test' },
      { key: 'design_effect', label: 'Design effect'},
      { key: 'design_effect_ttest', label: 'Design effect, t-test'}
    ];
  }
  // Gaussian - no GEE exchangeable distinction needed
  return [
    { key: 'mixed_model', label: 'Model-based' },
    { key: 'mixed_model_ttest', label: 'Model-based, t-test' },
    { key: 'satterthwaite', label: 'Satterthwaite' },
    { key: 'kenward_roger', label: 'Kenward-Roger' },
    { key: 'gee_independence_robust', label: 'GEE Independence Robust' },
  ];
};

// Memoized power comparison across estimators
const powerWarning = useMemo(() => {
  if (!wasmLoaded || resultsStale || isCalculating) return null;
  
  const currentResult = cachedResults[activeIndex];
  const currentPower = parseFloat(currentResult?.power);
  if (isNaN(currentPower)) return null;
  
  const currentEstimator = options.estimator;
  const d = designs[activeIndex];
  const outcomeType = d.options.outcomeType || options.outcomeType || 'continuous';
  const family = outcomeType === 'binary' ? 'binomial' 
               : outcomeType === 'count' ? 'poisson' 
               : 'gaussian';
  
  // Calculate power for all other estimators (filtered by family)
  const otherPowers = getEstimators(outcomeType)
    .filter(e => e.key !== currentEstimator)
    .map(e => {
      const modifiedOptions = { ...d.options, estimator: e.key };
      const result = MathsInterface.calculateResults(d.design, modifiedOptions, `_compare_${e.key}`);
      return {
        ...e,
        power: parseFloat(result.power)
      };
    })
    .filter(e => !isNaN(e.power));
  
  if (otherPowers.length === 0) return null;
  
  // Find the maximum difference where current is higher
  const maxDiff = Math.max(...otherPowers.map(e => currentPower - e.power));
  const minOtherPower = Math.min(...otherPowers.map(e => e.power));
  const lowEstimators = otherPowers.filter(e => currentPower - e.power >= 0.10);
  
  if (maxDiff >= 0.10) {
    return {
      selectedPower: currentPower,
      minOtherPower,
      difference: maxDiff,
      lowEstimators
    };
  }
  
  return null;
}, [wasmLoaded, resultsStale, isCalculating, cachedResults, activeIndex, options.estimator, options.outcomeType, designs]);

const correlationWarning = useMemo(() => {
  if (!wasmLoaded || resultsStale || isCalculating) return 0;
  
  const currentResult = cachedResults[activeIndex];
  const currentPower = parseFloat(currentResult?.power);
  if (isNaN(currentPower)) return 0;
  
  const d = designs[activeIndex];
  if (!d) return 0;
  
  const outcomeType = options?.outcomeType || 'continuous';
  const samplingStructure = options?.samplingStructure || 'cross_sectional';
  const iac = options?.iac || 0;
  console.log("correlation family: ", outcomeType);
  console.log("correlation iac: " , iac);
  console.log("correlation samp: ", samplingStructure);
  if (outcomeType === 'continuous') return 0;
  console.log("correlation passed early exit");
  // Pass the design ID - check how other functions reference it
  
  const warning = MathsInterface.getCorrelationWarning(`design-${activeIndex}`);
  console.log("Got warning:", warning);
if (warning === 3) return 3;  // solver failure always surfaces
if (samplingStructure === 'cross_section' || iac <= 0) return 0;
return warning;
}, [wasmLoaded, resultsStale, isCalculating, cachedResults, activeIndex, designs, options]);

  useEffect(() => {
  MathsInterface.initialize().then(success => {
    setWasmLoaded(success);
    hideLoading();
    if (!success) {
      console.error('Failed to initialize WASM module');
    }
  });
}, []);  // Empty array = runs once on mount

  useEffect(() => {
    setResultsStale(true);
  }, [designs]);

  useEffect(() => {
    const validEstimators = getEstimators(options.outcomeType).map(e => e.key);
    
    if (!validEstimators.includes(options.estimator)) {
      updateOptions("estimator", "mixed_model");
    }
  }, [options.outcomeType]);

  const recalculateResults = useCallback(async () => {
  if (!MathsInterface.isReady()) {
    console.warn('WASM not ready yet');
    return;
  }
  
  setIsCalculating(true);
  await new Promise((resolve) => setTimeout(resolve, 50));

  const newResults = designs.map((d,i) =>
    MathsInterface.calculateResults(d.design, d.options, `design-${i}`)
  );

  const newWeights = designs.map((d, i) => {
  const cellWeights = MathsInterface.calculateOptimalWeights(d.design, d.options, `design-${i}`);
  const seqWeights = MathsInterface.calculateOptimalSequenceWeights(d.design, d.options, `design-${i}`);
  console.log('Raw sequence weights:', seqWeights);
  const maxW = Math.max(...seqWeights);
  const normalizedRow = maxW > 0 ? seqWeights.map(w => w / maxW) : seqWeights;
  console.log('Normalized row weights:', normalizedRow);
  
  return {
    cell: cellWeights,
    row: normalizedRow
  };
});

  
  setCachedResults(newResults);
  setCachedWeights(newWeights);
  setCacheVersion((v) => v + 1);
  setResultsStale(false);
  setIsCalculating(false);
}, [designs, wasmLoaded]);

  const updateActiveDesign = useCallback(
    (modifier) => {
      setDesigns((prev) => {
        const newDesigns = [...prev];
        const newEntry = {
          ...newDesigns[activeIndex],
          design: newDesigns[activeIndex].design.clone(),
        };
        modifier(newEntry);
        newDesigns[activeIndex] = newEntry;
        return newDesigns;
      });
    },
    [activeIndex]
  );

  const updateOptions = useCallback(
    (key, value) => {
      setDesigns((prev) => {
        const newDesigns = [...prev];
        newDesigns[activeIndex] = {
          ...newDesigns[activeIndex],
          options: {
            ...newDesigns[activeIndex].options,
            [key]: value,
          },
        };
        return newDesigns;
      });
    },
    [activeIndex]
  );

const [addMenuOpen, setAddMenuOpen] = useState(false);
const addMenuRef = useRef(null);

const addNewDesign = useCallback(() => {
  if (designs.length >= 3) return;
  const newDesign = createDesignEntry(`Design ${designs.length + 1}`);
  setDesigns((prev) => [...prev, newDesign]);
  setActiveIndex(designs.length);
  setAddMenuOpen(false);
}, [designs.length]);

const duplicateDesign = useCallback((sourceIndex) => {
  if (designs.length >= 3) return;
  const source = designs[sourceIndex];
  const newEntry = {
    name: `Design ${designs.length + 1}`,
    design: source.design.clone(),
    options: { ...source.options },
  };
  setDesigns((prev) => [...prev, newEntry]);
  setActiveIndex(designs.length);
  setAddMenuOpen(false);
}, [designs]);

useEffect(() => {
  if (!addMenuOpen) return;
  const handleClickOutside = (e) => {
    if (addMenuRef.current && !addMenuRef.current.contains(e.target)) {
      setAddMenuOpen(false);
    }
  };
  document.addEventListener("mousedown", handleClickOutside);
  return () => document.removeEventListener("mousedown", handleClickOutside);
}, [addMenuOpen]);

  const removeDesign = useCallback(
    (index) => {
      if (designs.length <= 1) return;
      setDesigns((prev) => prev.filter((_, i) => i !== index));
      if (activeIndex >= index && activeIndex > 0) {
        setActiveIndex(activeIndex - 1);
      }
    },
    [designs.length, activeIndex]
  );

  const renameDesign = useCallback((index, newName) => {
    setDesigns((prev) => {
      const newDesigns = [...prev];
      newDesigns[index] = { ...newDesigns[index], name: newName };
      return newDesigns;
    });
  }, []);

  const handleCellClick = useCallback(
    (row, col) => {
      updateActiveDesign((entry) => {
        const cell = entry.design.getCell(row, col);
        const currentIdx = statusCycle.indexOf(cell.status);
        const nextStatus = statusCycle[(currentIdx + 1) % statusCycle.length];
        cell.status = nextStatus;
        cell.sampleSize =
          nextStatus === CellStatus.NOT_ENROLLED
            ? null
            : entry.options.meanClusterSize;
      });
    },
    [updateActiveDesign]
  );

  const handleCellContextMenu = useCallback(
    (e, rowIndex, colIndex) => {
      if (options.sampleSizeMode !== "exact") return;

      const cell = design.getCell(rowIndex, colIndex);
      if (cell.status === CellStatus.NOT_ENROLLED) return;

      e.preventDefault();

      setCellEditor({
        x: e.clientX,
        y: e.clientY,
        rowIndex,
        colIndex,
        initial: cell.sampleSize || options.meanClusterSize,
      });
    },
    [options.sampleSizeMode, options.meanClusterSize, design]
  );

  const closeCellEditor = useCallback(() => setCellEditor(null), []);

  const handlePeriodContextMenu = useCallback(
    (e, index) => {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          {
            label: "Insert period before",
            action: () =>
              updateActiveDesign((entry) => entry.design.insertPeriod(index)),
          },
          {
            label: "Insert period after",
            action: () =>
              updateActiveDesign((entry) =>
                entry.design.insertPeriod(index + 1)
              ),
          },
          { separator: true },
          {
            label: "Set all to control",
            action: () =>
              updateActiveDesign((entry) =>
                entry.design.setAllInPeriod(index, CellStatus.CONTROL)
              ),
          },
          {
            label: "Set all to intervention",
            action: () =>
              updateActiveDesign((entry) =>
                entry.design.setAllInPeriod(index, CellStatus.INTERVENTION)
              ),
          },
          { separator: true },
          {
            label: "Delete period",
            action: () =>
              updateActiveDesign((entry) => entry.design.removePeriod(index)),
            danger: true,
            disabled: design.numPeriods <= 1,
          },
        ],
      });
    },
    [design.numPeriods, updateActiveDesign]
  );

  const handleSequenceContextMenu = useCallback(
    (e, index) => {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          {
            label: "Insert sequence above",
            action: () =>
              updateActiveDesign((entry) => entry.design.insertSequence(index)),
          },
          {
            label: "Insert sequence below",
            action: () =>
              updateActiveDesign((entry) =>
                entry.design.insertSequence(index + 1)
              ),
          },
          { separator: true },
          {
            label: "Set all to control",
            action: () =>
              updateActiveDesign((entry) =>
                entry.design.setAllInSequence(index, CellStatus.CONTROL)
              ),
          },
          {
            label: "Set all to intervention",
            action: () =>
              updateActiveDesign((entry) =>
                entry.design.setAllInSequence(index, CellStatus.INTERVENTION)
              ),
          },
          { separator: true },
          {
            label: "Delete sequence",
            action: () =>
              updateActiveDesign((entry) => entry.design.removeSequence(index)),
            danger: true,
            disabled: design.numSequences <= 2,
          },
        ],
      });
    },
    [design.numSequences, updateActiveDesign]
  );

  const loadPreset = (preset) => {
  updateActiveDesign((entry) => {
    let newDesign;
    switch (preset) {
      case "parallel":
        newDesign = TrialDesign.createParallel(2, 1);
        break;
      case "parallel-baseline":
        newDesign = TrialDesign.createParallelBaseline(2, 2);
        break;
      case "stepped-wedge":
        newDesign = TrialDesign.createSteppedWedge(4, 5);
        break;
      case "stepped-wedge-implementation":
        newDesign = TrialDesign.createSteppedWedgeImplementation(4, 6);
        break;
      case "crossover":
        newDesign = TrialDesign.createCrossover(2, 2, false);
        break;
      case "crossover-washout":
        newDesign = TrialDesign.createCrossover(2, 2, true);
        break;
      case "staircase":
        newDesign = TrialDesign.createStaircase(4, 5);
        break;
      default:
        return;
    }
    MathsInterface.calculateSampleSize(
      newDesign,
      entry.options.meanClusterSize
    );
    entry.design = newDesign;
  });
};

  const exportDesignImage = async () => {
    if (!designGridRef.current) return;

    // Load html2canvas from CDN if not already loaded
    if (!window.html2canvas) {
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      document.head.appendChild(script);
      await new Promise((resolve) => (script.onload = resolve));
    }

    try {
      const canvas = await window.html2canvas(designGridRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        logging: false,
      });

      const link = document.createElement("a");
      link.download = `${activeDesign.name.replace(/\s+/g, "_")}_design.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  const getTreatmentEffectInfo = (outcomeType) => {
  switch (outcomeType) {
    case 'binary':
      return {
        label: 'Risk difference',
        tooltip: 'Absolute risk difference (e.g., 0.1 means 10 percentage point increase from baseline probability)',
        placeholder: 'e.g., 0.1'
      };
    case 'count':
      return {
        label: 'Rate ratio',
        tooltip: 'Ratio of treatment to control rate (e.g., 1.3 means 30% higher rate)',
        placeholder: 'e.g., 1.3'
      };
    default:
      return {
        label: 'Mean difference',
        tooltip: 'Difference in means between treatment and control groups',
        placeholder: 'e.g., 0.5'
      };
  }
};

  const grid = design.getGrid();
  const numSequences = design.numSequences;
  const numPeriods = design.numPeriods;
const [showTooltip, setShowTooltip] = useState(false);
const [showCorrTooltip, setShowCorrTooltip] = useState(false);
const [showReplTooltip, setShowReplTooltip] = useState(false);
const teInfo = getTreatmentEffectInfo(options.outcomeType);

  const exportSession = () => {
    const exportData = designs.map((d) => ({
      name: d.name,
      design: d.design.toJSON(),
      options: d.options,
      results: MathsInterface.calculateResults(d.design, d.options),
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trial-designs.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importSession = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target.result);

        const newDesigns = importedData.map((item, idx) => ({
          name: item.name || `Design ${idx + 1}`,
          design: TrialDesign.fromJSON(item.design),
          options: { ...createDefaultOptions(), ...item.options },
        }));

        if (newDesigns.length > 0) {
          setDesigns(newDesigns);
          setActiveIndex(0);
          setResultsStale(true);
        }
      } catch (err) {
        console.error("Import failed:", err);
        alert("Failed to import file: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const exportBundle = async () => {
    try {
      setIsExporting(true);
      await window.ReportGenerator.generateBundle(
        design,
        options,
        activeDesign.name
      );
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const infoTip = (text, show, setShow, wide = false) => (
    <span className="relative inline-flex">
      <button
        type="button"
        className="text-ink-400 hover:text-ink-700 focus:text-ink-700 cursor-help"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        aria-label={text}
      >
        <Icon name="info" className="w-3.5 h-3.5" />
      </button>
      {show && (
        <span
          role="tooltip"
          className={`absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5
                      text-xs font-normal leading-snug text-ink-50 bg-ink-800 rounded-md shadow-pop
                      ${wide ? "w-64 whitespace-normal" : "whitespace-nowrap"}`}
        >
          {text}
        </span>
      )}
    </span>
  );

  const totalClusters = design.getTotalClusters();

  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-7 pb-12">
        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.012em] text-ink-900">
              Cluster trial design tool
            </h1>
            <p className="mt-1 text-sm text-ink-600">
              Compare up to 3 designs. Click cells to cycle status. Right-click
              headers for options.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => document.getElementById("import-file").click()}
              className="btn btn-secondary"
              title="Import a previously saved session (JSON)"
            >
              <Icon name="upload" className="w-3.5 h-3.5" />
              Import session
            </button>
            <button
              onClick={exportSession}
              className="btn btn-secondary"
              title="Export your designs to a JSON file"
            >
              <Icon name="download" className="w-3.5 h-3.5" />
              Export session
            </button>
            <input
              id="import-file"
              type="file"
              accept=".json"
              className="hidden"
              onChange={importSession}
            />
          </div>
        </header>

        {/* Design tabs */}
        <div
          className="mt-6 mb-5 flex flex-wrap items-end gap-1 border-b border-ink-200"
          role="tablist"
        >
          {designs.map((d, i) => (
            <div
              key={i}
              role="tab"
              aria-selected={i === activeIndex}
              className={`group relative -mb-px flex items-center gap-2 pl-3 pr-2 h-10 rounded-t-md border border-b-0 cursor-pointer transition-colors
                ${
                  i === activeIndex
                    ? "bg-white border-ink-200"
                    : "border-transparent hover:bg-ink-100"
                }`}
              onClick={() => setActiveIndex(i)}
            >
              {i === activeIndex && (
                <span
                  className={`absolute left-0 right-0 top-0 h-0.5 rounded-t-md ${designColors[i].bg}`}
                />
              )}
              <span className={`w-2 h-2 rounded-full ${designColors[i].bg}`} />
              <input
                type="text"
                value={d.name}
                onChange={(e) => renameDesign(i, e.target.value)}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIndex(i);
                }}
                onFocus={() => setActiveIndex(i)}
                aria-label="Design name"
                className={`bg-transparent text-sm w-24 rounded px-0.5 focus:outline-none focus:bg-ink-50
                  ${
                    i === activeIndex
                      ? "font-semibold text-ink-900"
                      : "font-medium text-ink-600"
                  }`}
              />
              {designs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeDesign(i);
                  }}
                  className="w-5 h-5 flex items-center justify-center rounded text-ink-400 hover:text-red-600 hover:bg-red-50"
                  title="Remove design"
                  aria-label={`Remove ${d.name}`}
                >
                  <Icon name="close" className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          {designs.length < 3 && (
            <div className="relative mb-1.5 ml-1" ref={addMenuRef}>
              <button
                onClick={() => setAddMenuOpen((prev) => !prev)}
                className="btn btn-sm border-transparent text-ink-600 hover:text-ink-900 hover:bg-ink-100"
                aria-expanded={addMenuOpen}
              >
                <Icon name="plus" className="w-3.5 h-3.5" />
                Add design
              </button>
              {addMenuOpen && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-ink-200 rounded-md shadow-pop z-50 py-1 min-w-[180px]">
                  <button
                    onClick={addNewDesign}
                    className="w-full text-left px-3 py-1.5 text-sm text-ink-800 hover:bg-ink-50 transition-colors"
                  >
                    New blank design
                  </button>
                  <div className="border-t border-ink-100 my-1" />
                  {designs.map((d, i) => (
                    <button
                      key={i}
                      onClick={() => duplicateDesign(i)}
                      className="w-full text-left px-3 py-1.5 text-sm text-ink-800 hover:bg-ink-50 transition-colors"
                    >
                      Duplicate “{d.name}”
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Workspace. One grid so both columns share a top and a bottom edge:
            lg     grid | results      xl  grid       | results
                   parameters (wide)       parameters | (spans) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-rows-[1fr_auto] gap-5">
            <section className="panel flex flex-col min-w-0 lg:col-start-1 lg:row-start-1">
              <div className="panel-head">
                <h2 className="panel-title">Design grid</h2>
                <div className="flex flex-wrap items-center gap-1.5">
                  <label className="flex items-center gap-2 mr-1.5 text-xs font-medium text-ink-600">
                    Cell size
                    <input
                      type="range"
                      min="56"
                      max="96"
                      value={cellSize}
                      onChange={(e) => setCellSize(Number(e.target.value))}
                      className="w-20"
                    />
                  </label>
                  <button
                    onClick={() =>
                      setWeightMode(weightMode === "cell" ? "none" : "cell")
                    }
                    aria-pressed={weightMode === "cell"}
                    className={`btn btn-sm btn-toggle ${
                      weightMode === "cell" && resultsStale ? "opacity-60" : ""
                    }`}
                    title="Scale cells by their optimal allocation weight"
                  >
                    {weightMode === "cell" && (
                      <Icon name="check" className="w-3 h-3" />
                    )}
                    Cell weights{weightMode === "cell" && resultsStale && " *"}
                  </button>
                  <button
                    onClick={() =>
                      setWeightMode(weightMode === "row" ? "none" : "row")
                    }
                    aria-pressed={weightMode === "row"}
                    className={`btn btn-sm btn-toggle ${
                      weightMode === "row" && resultsStale ? "opacity-60" : ""
                    }`}
                    title="Scale sequences by their optimal allocation weight"
                  >
                    {weightMode === "row" && (
                      <Icon name="check" className="w-3 h-3" />
                    )}
                    Row weights{weightMode === "row" && resultsStale && " *"}
                  </button>
                  <button
                    onClick={exportDesignImage}
                    className="btn btn-sm btn-secondary"
                    title="Export design as PNG"
                  >
                    <Icon name="image" className="w-3.5 h-3.5" />
                    PNG
                  </button>
                </div>
              </div>

              {/* Presets */}
              <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 border-b border-ink-100">
                <span className="text-xs font-medium text-ink-600 mr-1">
                  Presets
                </span>
                {[
                  ["parallel", "Parallel"],
                  ["parallel-baseline", "Parallel with baseline"],
                  ["stepped-wedge", "Stepped wedge"],
                  ["stepped-wedge-implementation", "Stepped wedge with implementation"],
                  ["crossover", "Cross-over"],
                  ["crossover-washout", "Cross-over with washout"],
                  ["staircase", "Staircase"],
                ].map(([preset, label]) => (
                  <button
                    key={preset}
                    onClick={() => loadPreset(preset)}
                    className="chip"
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Grid canvas */}
              <div className="canvas flex-1 flex items-center overflow-x-auto min-h-[220px]">
                <div ref={designGridRef} className="inline-block p-5 mx-auto">
                  {/* Column headers */}
                  <div className="flex items-center mb-1 group">
                    <div style={{ width: SEQ_HEADER_W }} />
                    <div className="flex items-center">
                      <div className="w-2 flex justify-center">
                        <InsertButton
                          onClick={() =>
                            updateActiveDesign((e) => e.design.insertPeriod(0))
                          }
                        />
                      </div>
                      {Array(numPeriods)
                        .fill(null)
                        .map((_, j) => (
                          <React.Fragment key={j}>
                            <PeriodHeader
                              index={j}
                              onContextMenu={handlePeriodContextMenu}
                              cellSize={cellSize}
                            />
                            <div className="w-2 flex justify-center">
                              <InsertButton
                                onClick={() =>
                                  updateActiveDesign((e) =>
                                    e.design.insertPeriod(j + 1)
                                  )
                                }
                              />
                            </div>
                          </React.Fragment>
                        ))}
                    </div>
                  </div>

                  {/* Grid rows */}
                  <div className="flex flex-col">
                    <div className="flex items-center h-2 group">
                      <div
                        style={{ width: SEQ_HEADER_W }}
                        className="flex justify-end pr-1"
                      >
                        <InsertButton
                          onClick={() =>
                            updateActiveDesign((e) => e.design.insertSequence(0))
                          }
                        />
                      </div>
                    </div>

                    {grid.map((row, i) => (
                      <React.Fragment key={i}>
                        <div className="flex items-center group">
                          <SequenceHeader
                            index={i}
                            clusters={design.getClusters(i)}
                            onClustersChange={(idx, val) =>
                              updateActiveDesign((e) =>
                                e.design.setClusters(idx, val)
                              )
                            }
                            onContextMenu={handleSequenceContextMenu}
                            cellSize={cellSize}
                          />
                          <div className="flex items-center">
                            <div className="w-2" />
                            {row.map((cell, j) => (
                              <React.Fragment key={j}>
                                <DesignCellComponent
                                  cell={cell}
                                  rowIndex={i}
                                  colIndex={j}
                                  onClick={handleCellClick}
                                  onContextMenu={handleCellContextMenu}
                                  cellSize={cellSize}
                                  sampleSizeMode={options.sampleSizeMode}
                                  scale={
                                    weightMode === "cell" &&
                                    cachedWeights[activeIndex]?.cell
                                      ? cachedWeights[activeIndex].cell[i][j]
                                      : weightMode === "row" &&
                                        cachedWeights[activeIndex]?.row
                                      ? cachedWeights[activeIndex].row[i]
                                      : 1
                                  }
                                />
                                <div className="w-2" />
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center h-2 group">
                          <div
                            style={{ width: SEQ_HEADER_W }}
                            className="flex justify-end pr-1"
                          >
                            <InsertButton
                              onClick={() =>
                                updateActiveDesign((e) =>
                                  e.design.insertSequence(i + 1)
                                )
                              }
                            />
                          </div>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>

              {/* Legend and design summary */}
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5 border-t border-ink-100 text-xs">
                <div className="flex flex-wrap gap-4">
                  {Object.entries(statusConfig).map(([status, config]) => (
                    <div key={status} className="flex items-center gap-1.5">
                      <span
                        className={`w-3 h-3 rounded-[3px] border ${config.bg} ${config.border}`}
                      />
                      <span className="text-ink-600">{config.label}</span>
                    </div>
                  ))}
                </div>
                <p className="text-ink-600 tabular-nums">
                  <span className="font-semibold text-ink-900">{numSequences}</span>{" "}
                  {numSequences === 1 ? "sequence" : "sequences"}
                  <span className="mx-1.5 text-ink-300">/</span>
                  <span className="font-semibold text-ink-900">{numPeriods}</span>{" "}
                  {numPeriods === 1 ? "period" : "periods"}
                  <span className="mx-1.5 text-ink-300">/</span>
                  <span className="font-semibold text-ink-900">{totalClusters}</span>{" "}
                  {totalClusters === 1 ? "cluster" : "clusters"}
                </p>
              </div>
            </section>

            {/* Parameters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 min-w-0 lg:col-span-2 xl:col-span-1 xl:col-start-1 xl:row-start-2">
              {/* Analysis Options */}
              <section className="panel">
                <div className="panel-head">
                  <h2 className="panel-title">Analysis</h2>
                </div>
                <div className="panel-body grid grid-cols-2 gap-x-3 gap-y-3.5">
                  <div className="flex flex-col gap-1">
                    <label className="field-label">Outcome type</label>
                    <select
                      value={options.outcomeType}
                      onChange={(e) =>
                        updateOptions("outcomeType", e.target.value)
                      }
                      className="field"
                    >
                      <option value="continuous">Continuous</option>
                      <option value="binary">Binary</option>
                      <option value="count">Count</option>
                    </select>
                  </div>

                  {(options.outcomeType === "binary" ||
                    options.outcomeType === "count") && (
                    <div className="flex flex-col gap-1">
                      <label className="field-label">Baseline</label>
                      <NumericInput
                        step="0.01"
                        min={0.001}
                        value={options.baseline}
                        onChange={(v) => updateOptions("baseline", v)}
                        className="field"
                      />
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <label className="field-label">
                      {teInfo.label}
                      {infoTip(teInfo.tooltip, showTooltip, setShowTooltip)}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={options.treatmentEffect}
                      placeholder={teInfo.placeholder}
                      onChange={(e) =>
                        updateOptions(
                          "treatmentEffect",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="field"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="field-label">ICC</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={options.icc}
                      onChange={(e) =>
                        updateOptions(
                          "icc",
                          Math.min(
                            1,
                            Math.max(0, parseFloat(e.target.value) || 0)
                          )
                        )
                      }
                      className="field"
                    />
                  </div>

                  <div className="col-span-2 flex flex-col gap-1">
                    <label className="field-label">Estimator</label>
                    <select
                      value={options.estimator}
                      onChange={(e) => updateOptions("estimator", e.target.value)}
                      className="field"
                    >
                      {getEstimators(options.outcomeType).map((est) => (
                        <option key={est.key} value={est.key}>
                          {est.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {numPeriods > 1 && (
                    <>
                      <div className="flex flex-col gap-1">
                        <label className="field-label">Sampling</label>
                        <select
                          value={options.samplingStructure}
                          onChange={(e) =>
                            updateOptions("samplingStructure", e.target.value)
                          }
                          className="field"
                        >
                          <option value="cross_section">Cross-section</option>
                          <option value="closed_cohort">Closed cohort</option>
                          <option value="open_cohort">Open cohort</option>
                        </select>
                      </div>

                      {(options.samplingStructure === "closed_cohort" ||
                        options.samplingStructure === "open_cohort") && (
                        <div className="flex flex-col gap-1">
                          <label className="field-label">IAC</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            value={options.iac}
                            onChange={(e) =>
                              updateOptions(
                                "iac",
                                Math.min(
                                  1,
                                  Math.max(0, parseFloat(e.target.value) || 0)
                                )
                              )
                            }
                            className="field"
                          />
                        </div>
                      )}

                      {options.samplingStructure === "open_cohort" && (
                        <div className="flex flex-col gap-1">
                          <label className="field-label">
                            Replacement rate
                            {infoTip(
                              "Proportion of individuals replaced each period (0 = closed, 1 = cross-sectional)",
                              showReplTooltip,
                              setShowReplTooltip,
                              true
                            )}
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="1"
                            value={options.replacementRate ?? 0.5}
                            onChange={(e) =>
                              updateOptions(
                                "replacementRate",
                                Math.min(
                                  1,
                                  Math.max(0, parseFloat(e.target.value) || 0)
                                )
                              )
                            }
                            className="field"
                          />
                        </div>
                      )}

                      <div className="flex flex-col gap-1">
                        <label className="field-label">
                          Correlation
                          {infoTip(
                            {
                              exchangeable:
                                "Constant correlation between all periods within a cluster: Cor(t, t') = τ².",
                              nested_exchangeable:
                                "Exchangeable with a cluster autocorrelation (CAC) parameter: within-period correlation is τ² and between-period is τ² × CAC.",
                              exponential_decay:
                                "Correlation decays as a power of the time lag: τ²λ^|t−t'|, where λ ∈ (0,1) controls the rate of decay.",
                              exponential_function:
                                "Correlation decays via an exponential function: τ² exp(−|t−t'| / λ), where λ is the lengthscale.",
                            }[options.correlationStructure],
                            showCorrTooltip,
                            setShowCorrTooltip,
                            true
                          )}
                        </label>
                        <select
                          value={options.correlationStructure}
                          onChange={(e) =>
                            updateOptions("correlationStructure", e.target.value)
                          }
                          className="field"
                        >
                          <option value="exchangeable">Exchangeable</option>
                          <option value="nested_exchangeable">
                            Nested exch.
                          </option>
                          <option value="exponential_decay">Exp. decay</option>
                          <option value="exponential_function">
                            Exp. function
                          </option>
                        </select>
                      </div>

                      {options.correlationStructure !== "exchangeable" && (
                        <div className="flex flex-col gap-1">
                          <label className="field-label">
                            {options.correlationStructure ===
                            "nested_exchangeable"
                              ? "CAC"
                              : "Lengthscale"}
                          </label>
                          <NumericInput
                            step="0.1"
                            min={0.001}
                            value={options.temporalCorrelation}
                            onChange={(v) =>
                              updateOptions("temporalCorrelation", v)
                            }
                            className="field"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </section>

              {/* Sample Size Options */}
              <section className="panel">
                <div className="panel-head">
                  <h2 className="panel-title">Sample size</h2>
                </div>
                <div className="panel-body grid grid-cols-2 gap-x-3 gap-y-3.5">
                  <div className="col-span-2 flex flex-col gap-1">
                    <label className="field-label">Mode</label>
                    <select
                      value={options.sampleSizeMode}
                      onChange={(e) =>
                        updateOptions("sampleSizeMode", e.target.value)
                      }
                      className="field"
                    >
                      <option value="fixed">Fixed parameters</option>
                      <option value="exact">Exact cell sizes</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="field-label">Mean size</label>
                    <NumericInput
                      step="1"
                      min={1}
                      value={options.meanClusterSize}
                      onChange={(v) =>
                        updateOptions("meanClusterSize", Math.floor(v))
                      }
                      className="field"
                    />
                  </div>

                  {options.sampleSizeMode !== "exact" && (
                    <div className="flex flex-col gap-1">
                      <label className="field-label">CV of sizes</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={options.cvClusterSize}
                        onChange={(e) =>
                          updateOptions(
                            "cvClusterSize",
                            Math.max(0, parseFloat(e.target.value) || 0)
                          )
                        }
                        className="field"
                      />
                    </div>
                  )}

                  {options.sampleSizeMode === "exact" && (
                    <p className="col-span-2 text-xs text-ink-600">
                      Right-click cells to set individual sizes.
                    </p>
                  )}
                </div>
              </section>
            </div>

          {/* Right column: results */}
          <div className="flex flex-col gap-5 min-w-0 lg:col-start-2 lg:row-start-1 xl:row-span-2">
            <ResultsTable
              designs={designs}
              cachedResults={cachedResults}
              isStale={resultsStale}
              isCalculating={isCalculating}
              onRecalculate={recalculateResults}
              onExportBundle={exportBundle}
              isExporting={isExporting}
            />
            <CorrelationWarning warningCode={correlationWarning} />
            <PowerWarning
              warning={powerWarning}
              selectedEstimator={options.estimator}
              designName={activeDesign.name}
            />
            <PlotArea
              designs={designs}
              activeIndex={activeIndex}
              cachedResults={cachedResults}
              isStale={resultsStale}
              isCalculating={isCalculating}
              cacheVersion={cacheVersion}
            />

          </div>
        </div>
      </div>

      {/* Cell size editor (exact cell sizes mode) */}
      {cellEditor && (
        <CellSizeEditor
          x={cellEditor.x}
          y={cellEditor.y}
          initial={cellEditor.initial}
          onClose={closeCellEditor}
          onSave={(size) =>
            updateActiveDesign((entry) => {
              entry.design.getCell(
                cellEditor.rowIndex,
                cellEditor.colIndex
              ).sampleSize = size;
            })
          }
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);