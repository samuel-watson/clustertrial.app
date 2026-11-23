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

// === CALCULATION TRACE: independent arithmetic ===
// Used by the Calculation panel to recompute the engine's numbers from the
// exported matrices. Deliberately separate from the approximations above:
// these are accurate to ~1e-12 so they can be compared against Boost.

const TraceMath = (() => {
  const LANCZOS = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  const FPMIN = 1e-300;
  const EPS = 1e-15;

  function lgam(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgam(1 - x);
    x -= 1;
    let a = LANCZOS[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }

  // Regularised upper incomplete gamma Q(a, x)
  function gammaQ(a, x) {
    if (x <= 0) return 1;
    const lead = Math.exp(-x + a * Math.log(x) - lgam(a));
    if (x < a + 1) {
      let ap = a, sum = 1 / a, del = sum;
      for (let n = 0; n < 1000; n++) {
        ap += 1; del *= x / ap; sum += del;
        if (Math.abs(del) < Math.abs(sum) * EPS) break;
      }
      return 1 - sum * lead;
    }
    let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
    for (let i = 1; i < 1000; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return lead * h;
  }

  function normCdf(z) {
    const q = 0.5 * gammaQ(0.5, (z * z) / 2);
    return z < 0 ? q : 1 - q;
  }

  function normQuantile(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    // Acklam's rational approximation, then two Halley refinements
    let x = normalQuantile(p);
    for (let i = 0; i < 2; i++) {
      const e = normCdf(x) - p;
      const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
      x -= u / (1 + (x * u) / 2);
    }
    return x;
  }

  function betaCf(a, b, x) {
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 1000; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  function betaInc(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(lgam(a + b) - lgam(a) - lgam(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2)
      ? (bt * betaCf(a, b, x)) / a
      : 1 - (bt * betaCf(b, a, 1 - x)) / b;
  }

  function tCdf(t, nu) {
    const tail = 0.5 * betaInc(nu / 2, 0.5, nu / (nu + t * t));
    return t > 0 ? 1 - tail : tail;
  }

  function tQuantile(p, nu) {
    let lo = -1e7, hi = 1e7;
    for (let i = 0; i < 200 && hi - lo > 1e-13 * Math.max(1, Math.abs(lo)); i++) {
      const mid = 0.5 * (lo + hi);
      if (tCdf(mid, nu) < p) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  }

  // --- small dense linear algebra, row-major Float64Array ---
  function chol(A, n) {
    const L = new Float64Array(n * n);
    for (let j = 0; j < n; j++) {
      let s = A[j * n + j];
      for (let k = 0; k < j; k++) s -= L[j * n + k] * L[j * n + k];
      if (!(s > 0)) return null;
      const d = Math.sqrt(s);
      L[j * n + j] = d;
      for (let i = j + 1; i < n; i++) {
        let t = A[i * n + j];
        for (let k = 0; k < j; k++) t -= L[i * n + k] * L[j * n + k];
        L[i * n + j] = t / d;
      }
    }
    return L;
  }

  // Solve A X = B given chol(A) = L; B is n x m
  function cholSolve(L, n, B, m) {
    const X = Float64Array.from(B);
    for (let c = 0; c < m; c++) {
      for (let i = 0; i < n; i++) {
        let s = X[i * m + c];
        for (let k = 0; k < i; k++) s -= L[i * n + k] * X[k * m + c];
        X[i * m + c] = s / L[i * n + i];
      }
      for (let i = n - 1; i >= 0; i--) {
        let s = X[i * m + c];
        for (let k = i + 1; k < n; k++) s -= L[k * n + i] * X[k * m + c];
        X[i * m + c] = s / L[i * n + i];
      }
    }
    return X;
  }

  function invSPD(A, n) {
    const L = chol(A, n);
    if (!L) return null;
    const I = new Float64Array(n * n);
    for (let i = 0; i < n; i++) I[i * n + i] = 1;
    return cholSolve(L, n, I, n);
  }

  // A^T B, A is k x p, B is k x q
  function tmul(A, B, k, p, q) {
    const C = new Float64Array(p * q);
    for (let r = 0; r < k; r++)
      for (let i = 0; i < p; i++) {
        const a = A[r * p + i];
        if (a === 0) continue;
        for (let j = 0; j < q; j++) C[i * q + j] += a * B[r * q + j];
      }
    return C;
  }

  function mul(A, B, n, k, m) {
    const C = new Float64Array(n * m);
    for (let i = 0; i < n; i++)
      for (let r = 0; r < k; r++) {
        const a = A[i * k + r];
        if (a === 0) continue;
        for (let j = 0; j < m; j++) C[i * m + j] += a * B[r * m + j];
      }
    return C;
  }

  function addTo(A, B) { for (let i = 0; i < A.length; i++) A[i] += B[i]; }

  function maxRelDiff(A, B) {
    let num = 0, den = 0;
    for (let i = 0; i < A.length; i++) {
      num = Math.max(num, Math.abs(A[i] - B[i]));
      den = Math.max(den, Math.abs(B[i]));
    }
    return den > 0 ? num / den : num;
  }

  return { normCdf, normQuantile, tCdf, tQuantile, chol, cholSolve, invSPD, tmul, mul, addTo, maxRelDiff };
})();

// How each estimator code (EstimatorType) gets its variance and reference distribution
const TRACE_ESTIMATORS = {
  0: { variance: 'model', dist: 'z' },
  1: { variance: 'model', dist: 'bw' },
  2: { variance: 'model', dist: 'kr' },
  3: { variance: 'kr', dist: 'kr' },
  4: { variance: 'model', dist: 'z' },
  5: { variance: 'robust_ind', dist: 'z' },
  6: { variance: 'gee_exch', dist: 'z' },
  7: { variance: 'gee_exch', dist: 'bw' },
  8: { variance: 'deff', dist: 'z' },
  9: { variance: 'deff', dist: 'bw' },
};

const TRACE_REASONS = {
  kr: 'The Kenward-Roger adjustment is computed in the engine and is not recomputed here. Power below is recomputed from the engine’s standard error.',
  cv: 'The correction for variable cluster sizes uses the engine’s internal weights, which aren’t exported. Power below is recomputed from the engine’s standard error.',
  order: 'Skipped because the rows of X are not in the expected order.',
  pd: 'Skipped because a covariance block is not positive definite.',
  missing: 'Skipped because the matrices needed were not exported for this estimator.',
};

const relDiff = (a, b) => {
  const d = Math.abs(a - b);
  const s = Math.max(Math.abs(a), Math.abs(b));
  return s > 0 ? d / s : d;
};

// Up to `sig` significant figures, trailing zeros dropped
const fmtNum = (x, sig = 6) => {
  if (x == null || !Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a < 1e-4 || a >= 1e7) return x.toExponential(Math.min(sig - 1, 4));
  return String(parseFloat(x.toPrecision(sig)));
};

// embind turns NaN into null on the way out of the engine
const dofText = (d) => (d == null || Number.isNaN(d) ? 'not a number' : fmtNum(d));

const fmtDiff = (d) => (d === 0 ? '0' : d < 1e-15 ? '< 10⁻¹⁵' : d.toExponential(1));

// Singleton WASM wrapper instance per design
let wasmReady = false;

const MathsInterface = {
  // Cache for GLMM wrapper objects (keyed by design ID)
  _modelCache: new Map(),

  // Last full-precision engine result per design ID (see calculateResults)
  _rawResults: new Map(),

  _traceSignature(design, options, estimatorCode, cv) {
    const grid = design.getGrid().map((row) => row.map((c) => `${c.status}:${c.sampleSize ?? ''}`).join(',')).join('|');
    return `${estimatorCode}|${cv}|${design._clustersPerSequence.join(',')}|${grid}|${JSON.stringify(options)}`;
  },

  // Column names for data matrix
  _colnames: ['cl', 't', 'n', 'int', 'int2', 'int12', 'control', 'wn', 'xd'],

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

  // In exact mode each cell's size is baked into the model's weights when it
  // is built, so a size edit must force a rebuild
  const cellSizes = sampleSizeMode === 'exact'
    ? grid.map(row => row.map(cell => cell.sampleSize ?? '').join(',')).join('|')
    : '';

  const hash = `${design.numSequences}-${design.numPeriods}-${structure}-${clusters}-${totalClusters}-${corrStructure}-${samplingStructure}-${outcomeType}-${sampleSizeMode}-${meanClusterSize}-${cellSizes}`;
  
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

    // Cohort scaling columns (see GLMMWrapper::pushCohortTheta in the engine).
    // N_c is the cluster's largest cluster-period size, taken as its cohort.
    const cohortN = new Map();
    data.forEach((row) => cohortN.set(row[0], Math.max(cohortN.get(row[0]) ?? 0, row[2])));
    data.forEach((row) => {
      const N = cohortN.get(row[0]);
      row.push(1 / Math.sqrt(N));                          // wn
      row.push(Math.sqrt(Math.max(0, 1 / row[2] - 1 / N))); // xd
    });
    return data;
  },

  // Sizes differ within at least one cluster, so cohort terms need the
  // extra per-cluster-period component (xd)
  _hasSizeTerm(dataMatrix) {
    return dataMatrix.some((row) => row[8] > 1e-12);
  },

  // Build formula string (matches C++ formula generation)
  _buildFormula(design, options, dataMatrix = this._generateDataMatrix(design, options)) {
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

    // Individual-level covariance for cohort sampling. wn = 1/sqrt(N_c) makes
    // the persistent individual variance sigma2_ind / N_c between periods;
    // xd tops each cluster-period up to sigma2_ind / n when sizes vary.
    // Parameter order must match GLMMWrapper::pushCohortTheta.
    const cohort = options.samplingStructure === 'closed_cohort' || options.samplingStructure === 'open_cohort';
    if (cohort) {
      formula += options.samplingStructure === 'closed_cohort' ? '+(wn|gr(cl))' : '+(wn|gr(cl)*ar0(t))';
      if (dataMatrix && this._hasSizeTerm(dataMatrix)) formula += '+(xd|gr(cl,t))';
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

const formula = this._buildFormula(design, options, dataMatrix);
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
  
  // Exact mode: initialize() already set one weight per cluster-period from
  // each cell's size, so leave those alone. updateWeights() would overwrite
  // every row with the mean size. Parameters that take a single size get the
  // average of the cells' actual sizes.
  const exact = options.sampleSizeMode === 'exact';
  const meanSize = exact ? meanN : clusterSize;
  if (!exact) {
    console.log('Calling updateWeights...');
    wrapper.updateWeights(clusterSize);
  }

  console.log('Calling updateParameters...');
  wrapper.updateParameters(
    icc,
    iac,
    cacOrLengthscale,
    teLink,
    baselineLink,
    meanSize,
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

  // Step-by-step record of how one design's result was produced, for the
  // Calculation panel. It reads the same cached model object that
  // calculateResults used, so its numbers are the results table's numbers,
  // then recomputes them in JavaScript from the exported X and covariance.
  getCalculationTrace(design, options, designId) {
    if (!wasmReady) throw new Error('The statistics engine is still loading.');
    const wrapper = this._getWrapper(designId, design, options);
    const code = this._getEstimatorCode(options.estimator);
    const cv = options.sampleSizeMode === 'exact' ? 0 : (options.cvClusterSize ?? 0);

    const prior = this._rawResults.get(designId);
    const res =
      prior && prior.wrapper === wrapper && prior.sig === this._traceSignature(design, options, code, cv)
        ? prior.result
        : wrapper.calculatePower(code, cv);
    if (!res.valid) {
      throw new Error(res.error || 'The engine could not calculate power for this design.');
    }
    const engine = { se: res.se, power: res.power, dof: res.dof, mde: res.mde, ciWidth: res.ci_width };

    // Cluster-period rows, grouped by cluster (the order the engine receives them)
    const dataMatrix = this._generateDataMatrix(design, options);
    const seqOf = [];
    for (let s = 0, cl = 1; s < design.numSequences; s++) {
      for (let j = 0; j < design.getClusters(s); j++) seqOf[cl++] = s;
    }
    const clusters = [];
    dataMatrix.forEach((row, r) => {
      let c = clusters[clusters.length - 1];
      if (!c || c.id !== row[0]) {
        c = { id: row[0], seq: seqOf[row[0]], start: r, k: 0, periods: [], sizes: [], treated: [] };
        clusters.push(c);
      }
      c.k++;
      c.periods.push(row[1]);
      c.sizes.push(row[2]);
      c.treated.push(row[3]);
    });

    const raw = wrapper.getVerificationBundle(code, cv);
    const matFields = ['X', 'Sigma', 'M', 'Minv', 'bread', 'meat', 'V_working', 'Sigma_true'];
    const handles = [raw.beta, raw.theta, ...matFields.map((f) => raw[f] && raw[f].data)].filter(Boolean);

    const readVec = (v) => {
      const n = v.size();
      const out = new Float64Array(n);
      for (let i = 0; i < n; i++) out[i] = v.get(i);
      return out;
    };
    const readMat = (me) => {
      if (!me || !me.rows || !me.cols || me.data.size() !== me.rows * me.cols) return null;
      return { rows: me.rows, cols: me.cols, data: readVec(me.data), label: me.label };
    };
    // Covariance matrices are n x n but block-diagonal by cluster: read only the blocks
    const readBlocks = (me) => {
      const n = dataMatrix.length;
      if (!me || me.rows !== n || me.cols !== n || me.data.size() !== n * n) return null;
      return clusters.map((c) => {
        const out = new Float64Array(c.k * c.k);
        for (let i = 0; i < c.k; i++)
          for (let j = 0; j < c.k; j++) out[i * c.k + j] = me.data.get((c.start + i) * n + c.start + j);
        return out;
      });
    };
    // Largest entry linking the first two clusters; zero if clusters are independent
    const offBlock = (me) => {
      const n = dataMatrix.length;
      if (!me || me.rows !== n || me.cols !== n || me.data.size() !== n * n || clusters.length < 2) return 0;
      const a = clusters[0], b = clusters[1];
      let m = 0;
      for (let i = 0; i < a.k; i++)
        for (let j = 0; j < b.k; j++) m = Math.max(m, Math.abs(me.data.get((a.start + i) * n + b.start + j)));
      return m;
    };

    try {
      if (!raw.valid) throw new Error(raw.error || 'The engine could not export the calculation.');
      const X = readMat(raw.X);
      if (!X || X.rows !== dataMatrix.length) throw new Error('The design matrix could not be read.');
      const P = X.cols;
      const idx = raw.idx;

      let rowOrderOk = true;
      for (let r = 0; r < X.rows; r++) if (X.data[r * P + idx] !== dataMatrix[r][3]) rowOrderOk = false;

      const colLabels = [];
      for (let j = 0; j < P; j++) {
        let allOne = true, binary = true, equalsT = true;
        const ts = new Set();
        for (let r = 0; r < X.rows; r++) {
          const v = X.data[r * P + j];
          if (v !== 1) allOne = false;
          if (v !== 0 && v !== 1) binary = false;
          if (v === 1) ts.add(dataMatrix[r][1]);
          if (v !== dataMatrix[r][1]) equalsT = false;
        }
        colLabels.push(
          j === idx ? 'treatment'
            : allOne ? 'intercept'
            : binary && ts.size === 1 ? `period ${[...ts][0]}`
            : equalsT ? 't'
            : `x${j + 1}`
        );
      }

      const family = raw.family;
      const trace = {
        code,
        info: TRACE_ESTIMATORS[code] || TRACE_ESTIMATORS[0],
        cv,
        family,
        link: raw.link,
        formula: raw.formula,
        correlation: raw.correlation_structure,
        sampling: raw.sampling_structure,
        numSequences: design.numSequences,
        numPeriods: design.numPeriods,
        totalClusters: design.getTotalClusters(),
        nRows: X.rows,
        totalN: dataMatrix.reduce((s, row) => s + row[2], 0),
        clusters,
        X,
        P,
        idx,
        colLabels,
        rowOrderOk,
        sizeTerm: this._hasSizeTerm(dataMatrix),
        beta: Array.from(readVec(raw.beta)),
        theta: Array.from(readVec(raw.theta)),
        te: raw.te,
        alpha: raw.alpha,
        targetPower: raw.target_power,
        M: readMat(raw.M),
        Minv: readMat(raw.Minv),
        bread: readMat(raw.bread),
        meat: readMat(raw.meat),
        blocks: {
          Sigma: readBlocks(raw.Sigma),
          V_working: readBlocks(raw.V_working),
          Sigma_true: readBlocks(raw.Sigma_true),
        },
        offBlockMax: Math.max(offBlock(raw.Sigma), offBlock(raw.V_working), offBlock(raw.Sigma_true)),
        bundle: { varDelta: raw.var_delta, se: raw.se, power: raw.power, dof: raw.dof },
        solver: family === 'gaussian' ? null : {
          mu0: raw.target_baseline,
          mu1: raw.target_baseline_trt,
          icc: raw.target_icc,
          iac: raw.target_iac,
          sigmaC: raw.raw_sigma_c,
          sigmaP: raw.raw_sigma_p,
          iterations: raw.solver_iterations,
          converged: raw.solver_converged,
        },
        engine,
      };
      trace.params = this._traceParameters(trace, options);
      trace.expectedBlock = this._traceExpectedBlock(trace, options);
      trace.reproduced = this._traceReproduce(trace);
      trace.test = this._traceTest(trace);
      trace.checks = this._traceChecks(trace);
      return trace;
    } finally {
      handles.forEach((h) => { try { h.delete(); } catch (e) { /* already freed */ } });
    }
  },

  // The parameter values the engine should have received, from the inputs,
  // alongside what it actually holds (theta, beta).
  _traceParameters(t, o) {
    const icc = o.icc ?? 0.05;
    const iac = o.iac ?? 0.8;
    const lam = o.temporalCorrelation ?? o.cac ?? 0.8;
    // Same size the engine receives (see _updateWrapperParameters)
    const nbar = o.sampleSizeMode === 'exact' ? t.totalN / t.nRows : (o.meanClusterSize ?? 20);
    const rr = o.replacementRate ?? 1.0;
    const cohort = t.sampling === 'closed_cohort' || t.sampling === 'open_cohort';
    const lamLabel = t.correlation === 'exponential_function' ? 'Lengthscale λ' : 'Decay λ';
    const f = (x) => fmtNum(x, 6);
    const rows = [];
    let residual = null;
    // Cohort parameters, in the engine's order (GLMMWrapper::pushCohortTheta)
    const cohortRows = (formula, expr, value) => {
      rows.push({ label: 'Persistent individual variance', formula, expr, expected: value });
      if (t.sampling === 'open_cohort') {
        rows.push({ label: 'Retention between periods', formula: '1 − replacement rate', expr: `1 − ${f(rr)}`, expected: 1 - rr });
      }
      if (t.sizeTerm) {
        rows.push({ label: 'Extra individual variance for smaller cluster-periods', formula, expr, expected: value });
      }
    };

    if (t.family === 'gaussian') {
      if (t.correlation === 'nested_exchangeable') {
        rows.push({ label: 'Cluster variance', formula: 'ICC × CAC', expr: `${f(icc)} × ${f(lam)}`, expected: icc * lam });
        rows.push({ label: 'Cluster-period variance', formula: 'ICC × (1 − CAC)', expr: `${f(icc)} × ${f(1 - lam)}`, expected: icc * (1 - lam) });
      } else if (t.correlation === 'exponential_decay' || t.correlation === 'exponential_function') {
        rows.push({ label: 'Cluster variance', formula: 'ICC', expr: f(icc), expected: icc });
        rows.push({ label: lamLabel, formula: 'λ', expr: f(lam), expected: lam });
      } else {
        rows.push({ label: 'Cluster variance', formula: 'ICC', expr: f(icc), expected: icc });
      }
      if (cohort) {
        cohortRows('IAC × (1 − ICC)', `${f(iac)} × ${f(1 - icc)}`, iac * (1 - icc));
        residual ={ formula: '(1 − ICC) × (1 − IAC)', expr: `${f(1 - icc)} × ${f(1 - iac)}`, value: (1 - icc) * (1 - iac) };
      } else {
        residual = { formula: '1 − ICC', expr: `1 − ${f(icc)}`, value: 1 - icc };
      }
    } else if (t.solver) {
      const sc2 = t.solver.sigmaC * t.solver.sigmaC;
      const sc = `${f(t.solver.sigmaC)}²`;
      if (t.correlation === 'nested_exchangeable') {
        rows.push({ label: 'Cluster variance', formula: 'CAC × σ_c²', expr: `${f(lam)} × ${sc}`, expected: lam * sc2 });
        rows.push({ label: 'Cluster-period variance', formula: '(1 − CAC) × σ_c²', expr: `${f(1 - lam)} × ${sc}`, expected: (1 - lam) * sc2 });
      } else if (t.correlation === 'exponential_decay' || t.correlation === 'exponential_function') {
        rows.push({ label: 'Cluster variance', formula: 'σ_c²', expr: sc, expected: sc2 });
        rows.push({ label: lamLabel, formula: 'λ', expr: f(lam), expected: lam });
      } else {
        rows.push({ label: 'Cluster variance', formula: 'σ_c²', expr: sc, expected: sc2 });
      }
      if (cohort) {
        const sp2 = iac > 0 ? t.solver.sigmaP * t.solver.sigmaP : 0;
        cohortRows('σ_p²', iac > 0 ? `${f(t.solver.sigmaP)}²` : '0 (IAC is 0)', sp2);
      }
    }

    // Options that add terms this trace doesn't describe
    const comparable = !o.heterogeneousTe && !o.twoTreatments && rows.length === t.theta.length;
    rows.forEach((r, i) => { r.engine = t.theta[i]; });
    const allMatch = comparable && rows.every((r) => relDiff(r.engine, r.expected) < 1e-9);

    let betaExpected = null;
    if (t.family === 'gaussian' && !o.twoTreatments) {
      betaExpected = t.beta.map((_, j) => (j === 0 ? (o.baseline ?? 0.5) : j === 1 ? (o.treatmentEffect ?? 0.5) : 0));
    }
    const betaMatch = betaExpected ? betaExpected.every((b, j) => Math.abs(b - t.beta[j]) < 1e-12) : null;

    return { icc, iac, lam, nbar, rr, cohort, rows, residual, comparable, allMatch, betaExpected, betaMatch };
  },

  // Gaussian cross-sectional designs have a closed-form covariance block, so
  // it can be checked against the correlation structure the user picked.
  _traceExpectedBlock(t, o) {
    if (t.family !== 'gaussian' || t.sampling !== 'cross_section' || o.heterogeneousTe || o.twoTreatments) return null;
    const { icc, lam } = t.params;
    const shared = (lag) => {
      switch (t.correlation) {
        case 'nested_exchangeable': return lag === 0 ? icc : icc * lam;
        case 'exponential_decay': return icc * Math.pow(lam, lag);
        case 'exponential_function': return icc * Math.exp(-lag / lam);
        default: return icc;
      }
    };
    const formula = {
      exchangeable: { diag: 'ICC + (1 − ICC) / n', off: 'ICC' },
      nested_exchangeable: { diag: 'ICC + (1 − ICC) / n', off: 'ICC × CAC' },
      exponential_decay: { diag: 'ICC + (1 − ICC) / n', off: 'ICC × λ^|t − s|' },
      exponential_function: { diag: 'ICC + (1 − ICC) / n', off: 'ICC × exp(−|t − s| / λ)' },
    }[t.correlation] || { diag: 'ICC + (1 − ICC) / n', off: 'ICC' };

    const build = (c) => {
      const out = new Float64Array(c.k * c.k);
      for (let i = 0; i < c.k; i++)
        for (let j = 0; j < c.k; j++) {
          const lag = Math.abs(c.periods[i] - c.periods[j]);
          out[i * c.k + j] = shared(lag) + (i === j ? (1 - icc) / c.sizes[i] : 0);
        }
      return out;
    };
    let maxDiff = null;
    const impliedN = new Set();
    let sizesVary = false;
    if (t.blocks.Sigma) {
      maxDiff = 0;
      t.clusters.forEach((c, ci) => {
        const b = t.blocks.Sigma[ci];
        maxDiff = Math.max(maxDiff, TraceMath.maxRelDiff(build(c), b));
        for (let i = 0; i < c.k; i++) {
          // Cluster-period size the engine's diagonal implies
          impliedN.add(Number(((1 - icc) / (b[i * c.k + i] - shared(0))).toPrecision(6)));
          if (c.sizes[i] !== c.sizes[0] || c.sizes[i] !== t.clusters[0].sizes[0]) sizesVary = true;
        }
      });
    }
    // One implied size for every cell, although the cells' sizes differ
    const sizeNote =
      maxDiff != null && maxDiff >= 1e-8 && sizesVary && impliedN.size === 1
        ? `The engine's covariance implies a cluster-period size of ${[...impliedN][0]} in every cell, not the cell sizes you entered.`
        : null;
    return { formula, build, maxDiff, sizeNote };
  },

  // Recompute the variance of the treatment effect from the exported X and
  // covariance blocks only, one cluster at a time.
  _traceReproduce(t) {
    const { X, P, clusters, blocks, idx, cv, info } = t;
    const M_ = TraceMath;
    if (!t.rowOrderOk) return { reason: 'order' };
    const Xc = (c) => X.data.subarray(c.start * P, (c.start + c.k) * P);
    const zeros = () => new Float64Array(P * P);

    if (info.variance === 'model' || info.variance === 'kr' || info.variance === 'deff') {
      if (!blocks.Sigma) return { reason: 'missing' };
      const M = zeros();
      for (let ci = 0; ci < clusters.length; ci++) {
        const c = clusters[ci];
        const L = M_.chol(blocks.Sigma[ci], c.k);
        if (!L) return { reason: 'pd' };
        const x = Xc(c);
        M_.addTo(M, M_.tmul(x, M_.cholSolve(L, c.k, x, P), c.k, P, P));
      }
      const Minv = M_.invSPD(M, P);
      if (!Minv) return { reason: 'pd' };
      const out = { M, Minv, mDiff: t.M ? M_.maxRelDiff(M, t.M.data) : null, modelVar: Minv[idx * P + idx] };
      if (info.variance === 'kr') return { ...out, reason: 'kr' };
      if (cv > 0 && info.variance === 'model') return { ...out, reason: 'cv' };
      return { ...out, varDelta: out.modelVar };
    }

    if (info.variance === 'robust_ind') {
      if (cv > 0) return { reason: 'cv' };
      if (!blocks.Sigma) return { reason: 'missing' };
      const A = zeros(), B = zeros();
      clusters.forEach((c, ci) => {
        const x = Xc(c);
        M_.addTo(A, M_.tmul(x, x, c.k, P, P));
        M_.addTo(B, M_.tmul(x, M_.mul(blocks.Sigma[ci], x, c.k, c.k, P), c.k, P, P));
      });
      const Ainv = M_.invSPD(A, P);
      if (!Ainv) return { reason: 'pd' };
      const V = M_.mul(M_.mul(Ainv, B, P, P, P), Ainv, P, P, P);
      return {
        varDelta: V[idx * P + idx],
        breadDiff: t.bread ? M_.maxRelDiff(Ainv, t.bread.data) : null,
        meatDiff: t.meat ? M_.maxRelDiff(B, t.meat.data) : null,
      };
    }

    if (info.variance === 'gee_exch') {
      if (!blocks.V_working || !blocks.Sigma_true) return { reason: 'missing' };
      const M = zeros(), meat = zeros();
      for (let ci = 0; ci < clusters.length; ci++) {
        const c = clusters[ci];
        const L = M_.chol(blocks.V_working[ci], c.k);
        if (!L) return { reason: 'pd' };
        const x = Xc(c);
        const Y = M_.cholSolve(L, c.k, x, P);
        M_.addTo(M, M_.tmul(x, Y, c.k, P, P));
        M_.addTo(meat, M_.tmul(Y, M_.mul(blocks.Sigma_true[ci], Y, c.k, c.k, P), c.k, P, P));
      }
      const Minv = M_.invSPD(M, P);
      if (!Minv) return { reason: 'pd' };
      const V = M_.mul(M_.mul(Minv, meat, P, P, P), Minv, P, P, P);
      return {
        varDelta: V[idx * P + idx],
        mDiff: t.M ? M_.maxRelDiff(M, t.M.data) : null,
        meatDiff: t.meat ? M_.maxRelDiff(meat, t.meat.data) : null,
      };
    }
    return { reason: 'missing' };
  },

  // Critical value, test statistic, power, MDE and CI half-width
  _traceTest(t) {
    const rep = t.reproduced;
    const se = rep.varDelta != null ? Math.sqrt(rep.varDelta) : t.engine.se;
    const z = t.info.dist === 'z';
    const dof = t.info.dist === 'bw' ? Math.max(1, t.nRows - t.P) : t.info.dist === 'kr' ? t.engine.dof : null;
    if (!z && !(dof > 0 && Number.isFinite(dof))) {
      return { se, seFromEngine: rep.varDelta == null, dist: 't', dof, invalidDof: true };
    }
    const q =(p) => (z ? TraceMath.normQuantile(p) : TraceMath.tQuantile(p, dof));
    const cdf = (x) => (z ? TraceMath.normCdf(x) : TraceMath.tCdf(x, dof));
    const crit = q(1 - t.alpha / 2);
    const qPower = q(t.targetPower);
    const stat = Math.abs(t.te) / se;
    const power = t.info.dist === 'kr' && dof <= 1 ? 0 : cdf(stat - crit);
    return { se, seFromEngine: rep.varDelta == null, dist: z ? 'z' : 't', dof, crit, qPower, stat, power, mde: (crit + qPower) * se, ciWidth: crit * se };
  },

  _traceChecks(t) {
    const checks = [];
    const add = (label, status, detail) => checks.push({ label, status, detail });
    const rep = t.reproduced;
    const tol = 1e-8;

    add('Design matrix rows follow the design grid', t.rowOrderOk ? 'ok' : 'fail',
      t.rowOrderOk ? 'The treatment column of X matches the grid for every cluster-period.'
        : 'The treatment column of X does not match the grid, so nothing below was recomputed.');

    if (t.clusters.length > 1) {
      add('Clusters are independent', t.offBlockMax === 0 ? 'ok' : 'fail',
        t.offBlockMax === 0 ? 'Covariance between clusters 1 and 2 is exactly zero, so the matrix can be handled one cluster block at a time.'
          : `Covariance between clusters 1 and 2 reaches ${fmtNum(t.offBlockMax, 3)}.`);
    }

    if (t.params.comparable) {
      add('Model parameters match your inputs', t.params.allMatch && t.params.betaMatch !== false ? 'ok' : 'fail',
        t.params.allMatch ? 'Each covariance parameter the engine holds equals the value derived from your inputs.'
          : 'At least one covariance parameter differs from the value derived from your inputs.');
    }

    if (t.expectedBlock && t.expectedBlock.maxDiff != null) {
      const ok = t.expectedBlock.maxDiff < tol;
      add('Covariance follows your inputs', ok ? 'ok' : 'fail',
        `Largest relative difference between the engine's covariance blocks and the closed form for your ICC, correlation structure and cell sizes: ${fmtDiff(t.expectedBlock.maxDiff)}.` +
          (t.expectedBlock.sizeNote ? ` ${t.expectedBlock.sizeNote}` : ''));
    }

    const mDiff = rep.mDiff;
    if (mDiff != null) {
      add('Information matrix recomputed', mDiff < tol ? 'ok' : 'fail',
        `Rebuilt here from X and the covariance blocks. Largest relative difference: ${fmtDiff(mDiff)}.`);
    }

    if (rep.varDelta != null) {
      const d = relDiff(rep.varDelta, t.engine.se * t.engine.se);
      add('Variance of the treatment effect recomputed', d < tol ? 'ok' : 'fail',
        `Relative difference from the engine: ${fmtDiff(d)}.`);
    } else {
      add('Variance of the treatment effect recomputed', 'na', TRACE_REASONS[rep.reason] || TRACE_REASONS.missing);
    }

    if (t.info.dist === 'bw') {
      const ok = Math.abs(t.test.dof - t.engine.dof) < 1e-9;
      add('Degrees of freedom', ok ? 'ok' : 'fail',
        `Cluster-periods minus fixed effects: ${t.nRows} − ${t.P} = ${t.test.dof}. Engine: ${fmtNum(t.engine.dof, 6)}.`);
    }

    if (t.test.invalidDof) {
      add('Power and minimum detectable effect recomputed', 'fail',
        `The engine returned no valid degrees of freedom (${dofText(t.engine.dof)}) for this design, so its power (${fmtNum(t.engine.power)}) has no t reference distribution and can’t be reproduced.`);
    } else {
      const dPow = Math.abs(t.test.power - t.engine.power);
      const dMde = relDiff(t.test.mde, t.engine.mde);
      add('Power and minimum detectable effect recomputed', dPow < 1e-7 && dMde < 1e-7 ? 'ok' : 'fail',
        `Power differs by ${fmtDiff(dPow)}, MDE by ${fmtDiff(dMde)} (relative).`);
    }

    const dBundle = relDiff(t.bundle.se, t.engine.se);
    add('Verification bundle agrees with the results table', dBundle < 1e-10 ? 'ok' : 'fail',
      dBundle < 1e-10 ? 'The export uses a separate code path in the engine; it gives the same standard error.'
        : `The export's standard error (${fmtNum(t.bundle.se, 6)}) differs from the results table (${fmtNum(t.engine.se, 6)}).`);

    return checks;
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
      // Full-precision copy for the Calculation panel, so it can reuse this
      // exact result instead of repeating the engine call
      if (result.valid) {
        this._rawResults.set(designId, {
          wrapper,
          sig: this._traceSignature(design, options, estimatorCode, cv),
          result: { valid: true, se: result.se, power: result.power, dof: result.dof, mde: result.mde, ci_width: result.ci_width },
        });
      }
      
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
  chevron: "M6 3.5 10.5 8 6 12.5",
  minus: "M4 8h8",
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

const SEQ_HEADER_W = 104; // cluster-count input + row label menu button

// Explanatory tooltip for a control, styled like infoTip. Appears after a
// short hover delay (and on keyboard focus unless showOnFocus is false), and
// goes away on press or Escape. The text is always in the DOM and linked to
// the control with aria-describedby, so screen readers get it too.
const HoverTip = ({
  title,
  text,
  children,
  align = "start",
  showOnFocus = true,
  disabled = false,
  tipId,
  className = "",
}) => {
  const generatedId = React.useId();
  const id = tipId || generatedId;
  const [show, setShow] = useState(false);
  const timer = useRef(null);

  const open = (delay) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(true), delay);
  };
  const close = () => {
    clearTimeout(timer.current);
    setShow(false);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const position = {
    start: "left-0",
    center: "left-1/2 -translate-x-1/2",
    end: "right-0",
  }[align];

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => open(350)}
      onMouseLeave={close}
      onPointerDown={close}
      onFocus={showOnFocus ? () => open(0) : undefined}
      onBlur={close}
      onKeyDown={(e) => e.key === "Escape" && close()}
    >
      {React.cloneElement(children, { "aria-describedby": id })}
      <span
        id={id}
        role="tooltip"
        className={`absolute z-50 top-full mt-2 ${position} w-64 px-3 py-2
                    text-xs font-normal leading-snug text-ink-50 bg-ink-800 rounded-md shadow-pop
                    pointer-events-none ${show && !disabled ? "" : "hidden"}`}
      >
        {title && (
          <span className="block font-semibold text-white mb-0.5">{title}</span>
        )}
        {text}
      </span>
    </span>
  );
};

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

  // Move focus into the menu so it works from the keyboard, and hand it back
  // to whatever opened it (if that is still on the page) when it closes.
  useEffect(() => {
    const opener = document.activeElement;
    menuRef.current
      ?.querySelector('[role="menuitem"]:not(:disabled)')
      ?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  const handleKeyDown = (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const enabled = [
      ...menuRef.current.querySelectorAll('[role="menuitem"]:not(:disabled)'),
    ];
    const at = enabled.indexOf(document.activeElement);
    const step = e.key === "ArrowDown" ? 1 : -1;
    enabled[(at + step + enabled.length) % enabled.length]?.focus();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      onKeyDown={handleKeyDown}
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

// Where to open a header menu: at the pointer for a right-click, under the
// label for a click or a key press (which carry no useful pointer position).
const menuAnchor = (e) => {
  if (e.type === "contextmenu") return { x: e.clientX, y: e.clientY };
  const r = e.currentTarget.getBoundingClientRect();
  return { x: r.left, y: r.bottom + 4 };
};

// Grid chrome that helps editing but does not belong in the exported PNG.
const EXPORT_IGNORE = { "data-export-ignore": "" };

// Faint at rest so the insert points can be found; full strength on hover.
const InsertButton = ({ onClick, label, className = "" }) => (
  <button
    onClick={onClick}
    className={`
      flex items-center justify-center
      bg-accent-600 text-white rounded-full
      opacity-30 group-hover:opacity-100 hover:opacity-100 focus:opacity-100
      transition-opacity duration-150
      hover:bg-accent-700
      focus:outline-none focus:ring-2 focus:ring-accent-300 focus:ring-offset-1
      w-4 h-4
      ${className}
    `}
    aria-label={label}
    title={label}
    {...EXPORT_IGNORE}
  >
    <Icon name="plus" className="w-3 h-3" />
  </button>
);

// A row or column label that opens its options menu on click, Enter/Space or
// right-click. The chevron marks it as a menu; it is left out of the PNG.
const HeaderMenuButton = ({ label, ariaLabel, onOpenMenu, className = "", style }) => (
  <button
    type="button"
    aria-haspopup="menu"
    aria-label={ariaLabel}
    title={`${ariaLabel} (insert, fill or delete)`}
    onClick={onOpenMenu}
    onContextMenu={(e) => {
      e.preventDefault();
      onOpenMenu(e);
    }}
    className={`group/hdr flex items-center justify-center gap-0.5 rounded font-mono text-xs
                text-ink-600 select-none transition-colors
                hover:bg-ink-200/70 hover:text-ink-900 aria-expanded:bg-ink-200/70
                focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${className}`}
    style={style}
  >
    {label}
    <span {...EXPORT_IGNORE} className="flex">
      <Icon
        name="chevron"
        className="w-2.5 h-2.5 rotate-90 text-ink-400 group-hover/hdr:text-ink-700 transition-colors"
      />
    </span>
  </button>
);

const PeriodHeader = ({ index, onContextMenu, cellSize }) => (
  <HeaderMenuButton
    label={`T${index}`}
    ariaLabel={`Period T${index} options`}
    onOpenMenu={(e) => onContextMenu(e, index)}
    style={{ width: cellSize, height: 32 }}
  />
);

// Widths shared by the sequence headers and the "Clusters" column heading
// above them, so the heading sits exactly over the inputs.
const SEQ_INPUT_W = "w-12";
const SEQ_LABEL_W = "w-10";

const SequenceHeader = ({
  index,
  clusters,
  onClustersChange,
  onContextMenu,
  cellSize,
}) => (
  <div
    className="flex items-center justify-end gap-1.5 pr-1"
    style={{ width: SEQ_HEADER_W, height: cellSize }}
  >
    <input
      type="number"
      min="1"
      value={clusters}
      onChange={(e) => onClustersChange(index, parseInt(e.target.value) || 1)}
      className={`field field-sm ${SEQ_INPUT_W} text-center`}
      aria-label={`Clusters in sequence S${index + 1}`}
      title={`Number of clusters in sequence S${index + 1}`}
    />
    <HeaderMenuButton
      label={`S${index + 1}`}
      ariaLabel={`Sequence S${index + 1} options`}
      onOpenMenu={(e) => onContextMenu(e, index)}
      className={`${SEQ_LABEL_W} h-7`}
    />
  </div>
);

// Column heading over the per-sequence cluster inputs.
const ClustersColumnHeading = () => (
  <div
    className="flex items-end justify-end gap-1.5 pr-1 pb-1.5"
    style={{ width: SEQ_HEADER_W }}
  >
    <span
      className={`${SEQ_INPUT_W} text-center text-[11px] font-semibold leading-none text-ink-600`}
      title="Number of clusters in each sequence"
    >
      Clusters
    </span>
    <span className={SEQ_LABEL_W} />
  </div>
);

// Dashed lanes along the right and bottom edges of the grid: always visible
// places to add a period or a sequence.
const addLaneClass = `flex items-center justify-center gap-1 rounded-md border-[1.5px] border-dashed
  border-ink-300 bg-white/60 text-[11px] font-medium text-ink-500 transition-colors
  hover:border-accent-500 hover:bg-accent-50 hover:text-accent-700
  focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500`;

const AddPeriodLane = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`${addLaneClass} flex-col w-11 my-2 ml-1 self-stretch`}
    aria-label="Add a period at the end"
    title="Add a period at the end"
    {...EXPORT_IGNORE}
  >
    <Icon name="plus" className="w-3.5 h-3.5" />
    Period
  </button>
);

const AddSequenceLane = ({ onClick, numPeriods, cellSize }) => (
  <div className="flex" {...EXPORT_IGNORE}>
    <div style={{ width: SEQ_HEADER_W + 8 }} />
    <button
      type="button"
      onClick={onClick}
      className={`${addLaneClass} h-8 mt-0.5`}
      style={{ width: Math.max(numPeriods * (cellSize + 8) - 8, 96) }}
      aria-label="Add a sequence at the end"
      title="Add a sequence at the end"
    >
      <Icon name="plus" className="w-3.5 h-3.5" />
      Sequence
    </button>
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
  const next =
    statusConfig[
      statusCycle[(statusCycle.indexOf(cell.status) + 1) % statusCycle.length]
    ];
  const canSetSize =
    sampleSizeMode === "exact" && cell.status !== CellStatus.NOT_ENROLLED;
  const description = [
    `${config.label}${
      sampleSizeMode === "exact" && cell.sampleSize ? ` (n=${cell.sampleSize})` : ""
    }${scale < 1 ? ` (weight: ${(scale * 100).toFixed(0)}%)` : ""}.`,
    `Click to make ${next.label.toLowerCase()}.`,
    canSetSize ? "Right-click to set its cluster-period size." : "",
  ]
    .filter(Boolean)
    .join(" ");

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
          border-[1.5px] rounded-md cursor-pointer transition-[width,height] duration-300 ease-out
          focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-1
          flex flex-col items-center justify-center
        `}
        style={{
          width: scaledSize,
          height: scaledSize,
          fontSize: `${Math.max(0.6, scale) * 100}%`,
        }}
        title={description}
        aria-label={`Sequence S${rowIndex + 1}, period T${colIndex}: ${description}`}
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

// === CALCULATION PANEL ===
// A step-by-step view of how the active design's result was produced,
// with each number recomputed in the browser and compared with the engine.

const blockStats = (b, k) => {
  let dmin = Infinity, dmax = -Infinity, omin = Infinity, omax = -Infinity;
  for (let i = 0; i < k; i++)
    for (let j = 0; j < k; j++) {
      const v = b[i * k + j];
      if (i === j) { dmin = Math.min(dmin, v); dmax = Math.max(dmax, v); }
      else { omin = Math.min(omin, v); omax = Math.max(omax, v); }
    }
  return { dmin, dmax, omin, omax };
};

// "σ_c²" -> σ<sub>c</sub>²
const withSubs = (s) =>
  String(s).split(/_([A-Za-z0-9]+)/).map((part, i) =>
    i % 2 ? <sub key={i} className="text-[0.75em]">{part}</sub> : part
  );

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const fmtSpan = (lo, hi) =>
  !Number.isFinite(lo) ? '—' : relDiff(lo, hi) < 1e-12 ? fmtNum(lo) : `${fmtNum(lo)} to ${fmtNum(hi)}`;

const Agree = ({ ok, engine }) => (
  <span className={`ml-2 inline-flex items-center gap-1 font-sans text-[11px] align-middle ${ok ? 'text-accent-700' : 'text-red-600 font-medium'}`}>
    <Icon name={ok ? 'check' : 'alert'} className="w-3 h-3" />
    {ok ? 'matches the engine' : `engine gives ${engine}`}
  </span>
);

const CalcStep = ({ n, title, children }) => (
  <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-3 py-4 border-t border-ink-100 first:border-t-0">
    <span className="mt-px w-6 h-6 rounded-full bg-ink-100 text-ink-600 text-xs font-medium flex items-center justify-center tabular-nums">
      {n}
    </span>
    <div className="min-w-0">
      <h3 className="text-sm font-semibold text-ink-900 mb-1">{title}</h3>
      {children}
    </div>
  </li>
);

const CalcText = ({ children }) => (
  <p className="text-[13px] leading-relaxed text-ink-600 mb-2 max-w-[78ch]">{children}</p>
);

const CalcMathBox = ({ children }) => (
  <div className="font-mono text-xs leading-6 text-ink-800 bg-ink-50 border border-ink-100 rounded-md px-3 py-1.5 overflow-x-auto whitespace-nowrap">
    {children}
  </div>
);

const Reveal = ({ label, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs font-medium text-accent-700 hover:text-accent-800 hover:underline underline-offset-2"
      >
        <Icon name="chevron" className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        {open ? `Hide ${label}` : `Show ${label}`}
      </button>
      {open && children}
    </div>
  );
};

const MatrixTable = ({ data, cols, rowStart = 0, rowEnd, rowLabels, colLabels, highlight }) => {
  const rows = [];
  for (let i = rowStart; i < rowEnd; i++) rows.push(i);
  const colIdx = Array.from({ length: cols }, (_, j) => j);
  return (
    <div className="mt-2 max-h-72 max-w-full overflow-auto border border-ink-200 rounded-md bg-white">
      <table className="text-[11px] font-mono tabular-nums border-collapse">
        {colLabels && (
          <thead className="sticky top-0 bg-ink-50">
            <tr>
              <th className="px-2 py-1" />
              {colIdx.map((j) => (
                <th key={j} className="px-2 py-1 text-right font-medium text-ink-500 whitespace-nowrap">
                  {colLabels[j]}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((i) => (
            <tr key={i} className="border-t border-ink-100">
              <th className="px-2 py-0.5 text-left font-normal text-ink-500 whitespace-nowrap">
                {rowLabels ? rowLabels(i) : i + 1}
              </th>
              {colIdx.map((j) => (
                <td
                  key={j}
                  className={`px-2 py-0.5 text-right whitespace-nowrap ${
                    highlight && highlight[0] === i && highlight[1] === j
                      ? 'bg-accent-50 text-accent-800 font-medium'
                      : 'text-ink-800'
                  }`}
                >
                  {fmtNum(data[i * cols + j], 5)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const CovHeatmap = ({ block, k, periods, label }) => {
  let max = 0;
  for (let i = 0; i < block.length; i++) max = Math.max(max, Math.abs(block[i]));
  const px = Math.max(10, Math.min(28, Math.floor(252 / k)));
  return (
    <figure className="m-0 shrink-0">
      <div
        className="inline-grid gap-px bg-ink-200 border border-ink-200"
        style={{ gridTemplateColumns: `repeat(${k}, ${px}px)` }}
        role="img"
        aria-label={`${label}: ${k} by ${k} covariance block`}
      >
        {Array.from(block).map((v, i) => {
          const r = Math.floor(i / k), c = i % k;
          const a = max > 0 ? Math.abs(v) / max : 0;
          return (
            <div
              key={i}
              title={`${label.replace(/_/g, '')}, period ${periods[r]} × period ${periods[c]}: ${fmtNum(v, 8)}`}
              style={{ width: px, height: px, backgroundColor: `rgba(11, 88, 98, ${(0.05 + 0.9 * a).toFixed(3)})` }}
            />
          );
        })}
      </div>
      <figcaption className="mt-1 text-[11px] text-ink-500">
        {withSubs(label)} · periods {periods[0]}–{periods[k - 1]}
      </figcaption>
    </figure>
  );
};

const BlockSummary = ({ block, k, expected }) => {
  const s = blockStats(block, k);
  const e = expected ? blockStats(expected, k) : null;
  const ok = expected ? TraceMath.maxRelDiff(expected, block) < 1e-8 : null;
  return (
    <CalcMathBox>
      <div>diagonal = {fmtSpan(s.dmin, s.dmax)}</div>
      {k > 1 && <div>off-diagonal = {fmtSpan(s.omin, s.omax)}</div>}
      {e && (
        <div className="text-ink-600">
          expected from your inputs: {fmtSpan(e.dmin, e.dmax)}
          {k > 1 && <> and {fmtSpan(e.omin, e.omax)}</>}
          <Agree ok={ok} engine="different values" />
        </div>
      )}
    </CalcMathBox>
  );
};

const traceStatus = (checks) =>
  checks.some((c) => c.status === 'fail') ? 'fail' : checks.some((c) => c.status === 'na') ? 'partial' : 'ok';

// Above this many cluster-periods, build the trace only when asked
const TRACE_CONFIRM_ROWS = 1000;

const STATUS_PILL = {
  ok: { text: 'Reproduced independently', cls: 'bg-accent-50 text-accent-800 border-accent-200', icon: 'check' },
  partial: { text: 'Partly reproduced', cls: 'bg-ink-50 text-ink-700 border-ink-200', icon: 'info' },
  fail: { text: 'Discrepancy found', cls: 'bg-red-50 text-red-800 border-red-200', icon: 'alert' },
};

const CalculationSteps = ({ t, seqView, setSeqView }) => {
  const { info, family, params, engine, test, reproduced: rep } = t;
  const binary = family === 'binomial';
  const count = family === 'poisson';
  const sequencesWithClusters = [...new Set(t.clusters.map((c) => c.seq))];
  const shown = t.clusters.find((c) => c.seq === seqView) || t.clusters[0];
  const shownIndex = t.clusters.indexOf(shown);
  const tName = t.colLabels[t.idx];
  const P = t.P;
  const engineVar = engine.se * engine.se;
  const shownVar = rep.varDelta != null ? rep.varDelta : engineVar;
  const muBar = t.solver ? (t.solver.mu0 + t.solver.mu1) / 2 : null;
  const scale = binary ? 'probability' : count ? 'rate' : 'outcome';
  const rowLabel = (i) => {
    const c = t.clusters.find((cc) => i >= cc.start && i < cc.start + cc.k);
    return `cl ${c.id}, t${c.periods[i - c.start]}`;
  };
  const sub = (s) => <sub className="text-[0.75em]">{s}</sub>;

  const seqPicker = sequencesWithClusters.length > 1 && (
    <label className="inline-flex items-center gap-2 text-xs text-ink-600">
      Show cluster from
      <select
        value={shown.seq}
        onChange={(e) => setSeqView(Number(e.target.value))}
        className="field field-sm"
      >
        {sequencesWithClusters.map((s) => (
          <option key={s} value={s}>Sequence {s + 1}</option>
        ))}
      </select>
    </label>
  );

  // Which covariance blocks this estimator uses
  const covBlocks =
    info.variance === 'gee_exch'
      ? [
          { key: 'V_working', label: 'Working covariance V_w' },
          { key: 'Sigma_true', label: 'True covariance Σ' },
        ]
      : [{ key: 'Sigma', label: info.variance === 'deff' ? `Covariance V (${scale} scale)` : 'Covariance Σ' }];

  const expectedShown = t.expectedBlock && info.variance !== 'deff' ? t.expectedBlock.build(shown) : null;

  const mat = (m, highlight) =>
    m && (
      <MatrixTable
        data={m.data}
        cols={m.cols}
        rowEnd={m.rows}
        rowLabels={(i) => t.colLabels[i]}
        colLabels={t.colLabels}
        highlight={highlight ? [t.idx, t.idx] : null}
      />
    );
  const mInfo = t.M ? mat(t.M) : null;

  return (
    <ol className="px-4">
      <CalcStep n={1} title="From the design grid to the model">
        <CalcText>
          {plural(t.totalClusters, 'cluster')} in {plural(t.numSequences, 'sequence')} over{' '}
          {plural(t.numPeriods, 'period')} give {plural(t.nRows, 'cluster-period')}. Each is one row of the model, and
          between them they hold {t.totalN.toLocaleString()} participants.
        </CalcText>
        <CalcMathBox>
          <div>formula: {t.formula}</div>
          <div>family: {family}, link: {t.link}</div>
          <div>X: {t.nRows} × {P} · columns: {t.colLabels.join(', ')}</div>
        </CalcMathBox>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-ink-600">
            Rows of X for cluster {shown.id} (sequence {shown.seq + 1})
          </span>
          {seqPicker}
        </div>
        <MatrixTable
          data={t.X.data}
          cols={P}
          rowStart={shown.start}
          rowEnd={shown.start + shown.k}
          rowLabels={rowLabel}
          colLabels={t.colLabels}
        />
        {t.nRows > shown.k && (
          <Reveal label={`all ${t.nRows} rows`}>
            <MatrixTable data={t.X.data} cols={P} rowEnd={Math.min(t.nRows, 500)} rowLabels={rowLabel} colLabels={t.colLabels} />
            {t.nRows > 500 && (
              <p className="mt-1 text-[11px] text-ink-500">First 500 rows. The verification bundle has the full matrix.</p>
            )}
          </Reveal>
        )}
      </CalcStep>

      <CalcStep n={2} title="Your inputs become model parameters">
        {family === 'gaussian' ? (
          <CalcText>
            The total outcome variance is fixed at 1, so the treatment effect is in standard deviation units. The ICC
            splits that variance into a part shared within each cluster and a residual part.
          </CalcText>
        ) : (
          <>
            <CalcText>
              Your baseline and effect are {binary ? 'probabilities' : 'rates'} on the observed scale. The engine solves for
              conditional parameters on the {t.link} scale that reproduce them together with the ICC
              {params.cohort && params.iac > 0 ? ' and IAC' : ''}.
            </CalcText>
            {t.solver && (
              <CalcMathBox>
                <div>
                  targets: {binary ? 'p' : 'μ'}{sub('0')} = {fmtNum(t.solver.mu0)}, {binary ? 'p' : 'μ'}{sub('1')} ={' '}
                  {fmtNum(t.solver.mu1)}, ICC = {fmtNum(t.solver.icc)}
                  {params.cohort && params.iac > 0 ? `, IAC = ${fmtNum(t.solver.iac)}` : ''}
                </div>
                <div>
                  solved: β{sub('0')} = {fmtNum(t.beta[0])}, β{sub('1')} = {fmtNum(t.beta[1])}, σ{sub('c')} ={' '}
                  {fmtNum(t.solver.sigmaC)}
                  {params.cohort && params.iac > 0 ? <>, σ{sub('p')} = {fmtNum(t.solver.sigmaP)}</> : null}
                </div>
                <div className={t.solver.converged ? '' : 'text-red-700'}>
                  solver: {t.solver.converged ? 'converged' : 'did not converge'} after {t.solver.iterations} iterations
                </div>
              </CalcMathBox>
            )}
          </>
        )}
        {params.rows.length > 0 && (
          <div className="mt-2 max-w-full overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr className="text-left text-ink-500 border-b border-ink-200">
                  <th className="py-1 pr-4 font-medium">Covariance parameter</th>
                  <th className="py-1 pr-4 font-medium">From your inputs</th>
                  <th className="py-1 pr-4 font-medium text-right">Value</th>
                  <th className="py-1 font-medium text-right">Engine holds</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums text-ink-800">
                {params.rows.map((r, i) => {
                  const ok = params.comparable && relDiff(r.engine, r.expected) < 1e-9;
                  return (
                    <tr key={i} className="border-b border-ink-100">
                      <td className="py-1 pr-4 font-sans text-ink-700 whitespace-nowrap">{r.label}</td>
                      <td className="py-1 pr-4 whitespace-nowrap">{withSubs(r.formula)} = {r.expr}</td>
                      <td className="py-1 pr-4 text-right">{fmtNum(r.expected)}</td>
                      <td className="py-1 text-right whitespace-nowrap">
                        {fmtNum(r.engine)}
                        {params.comparable && (
                          <Icon
                            name={ok ? 'check' : 'alert'}
                            className={`inline w-3 h-3 ml-1.5 -mt-0.5 ${ok ? 'text-accent-700' : 'text-red-600'}`}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {(params.residual || family === 'gaussian') && (
          <div className="mt-2">
            <CalcMathBox>
              {params.residual && (
                <div>residual variance σ² = {params.residual.formula} = {params.residual.expr} = {fmtNum(params.residual.value)}</div>
              )}
              <div>
                fixed effects β: {t.beta.map((b, j) => `${t.colLabels[j] || `β${j}`} ${fmtNum(b)}`).join(', ')}
                {params.betaMatch != null && <Agree ok={params.betaMatch} engine="other values" />}
              </div>
            </CalcMathBox>
          </div>
        )}
      </CalcStep>

      <CalcStep n={3} title="Covariance of the cluster-period means">
        <CalcText>
          Clusters are independent, so the full {t.nRows} × {t.nRows} matrix is block-diagonal, with one block per
          cluster. Below is the {shown.k} × {shown.k} block for cluster {shown.id} (sequence {shown.seq + 1}). Hover a
          cell for its value.
          {info.variance === 'gee_exch' && muBar != null && (
            <>
              {' '}GEE builds a working covariance V on the {scale} scale and moves it to the {t.link} scale with the delta
              method: V{sub('w')} = V × (1 / {binary ? 'μ̄(1 − μ̄)' : 'μ̄'})², where μ̄ = ({binary ? 'p' : 'μ'}₀ +{' '}
              {binary ? 'p' : 'μ'}₁) / 2 = {fmtNum(muBar)}. The true covariance Σ comes from the GLMM and enters the
              sandwich.
            </>
          )}
          {info.variance === 'deff' && muBar != null && (
            <>
              {' '}The design-effect method works on the {scale} scale, with the variance evaluated at μ̄ ={' '}
              {fmtNum(muBar)}, the average of the two arms.
            </>
          )}
          {t.cv > 0 && (info.variance === 'gee_exch' || info.variance === 'deff') && (
            <> The diagonal includes the correction for variable cluster sizes, × (1 + cv²) with cv = {fmtNum(t.cv)}.</>
          )}
        </CalcText>
        {sequencesWithClusters.length > 1 && <div className="mb-2">{seqPicker}</div>}
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
          {covBlocks.map((b) =>
            t.blocks[b.key] ? (
              <div key={b.key} className="flex flex-wrap items-start gap-4 min-w-0">
                <CovHeatmap block={t.blocks[b.key][shownIndex]} k={shown.k} periods={shown.periods} label={b.label} />
                <div className="min-w-0">
                  <BlockSummary
                    block={t.blocks[b.key][shownIndex]}
                    k={shown.k}
                    expected={b.key === 'Sigma' ? expectedShown : null}
                  />
                  {b.key === 'Sigma' && expectedShown && (
                    <p className="mt-1 text-[11px] text-ink-500 font-mono">
                      Σ{sub('tt')} = {t.expectedBlock.formula.diag}, Σ{sub('ts')} = {t.expectedBlock.formula.off}
                    </p>
                  )}
                  <Reveal label="block as numbers">
                    <MatrixTable
                      data={t.blocks[b.key][shownIndex]}
                      cols={shown.k}
                      rowEnd={shown.k}
                      rowLabels={(i) => `t${shown.periods[i]}`}
                      colLabels={shown.periods.map((p) => `t${p}`)}
                    />
                  </Reveal>
                </div>
              </div>
            ) : (
              <p key={b.key} className="text-xs text-ink-500">{b.label} was not exported for this estimator.</p>
            )
          )}
        </div>
      </CalcStep>

      <CalcStep n={4} title="Variance of the treatment effect">
        {info.variance === 'model' && (
          <>
            <CalcText>
              The model-based (generalised least squares) variance: invert the information matrix and read off the
              treatment entry.
            </CalcText>
            <CalcMathBox>
              <div>M = Xᵀ Σ⁻¹ X <span className="text-ink-500">({P} × {P})</span></div>
              {t.cv > 0 && (
                <div>with variable cluster sizes, Σ{sub('tt')} is increased by cv² / w{sub('t')} before inverting (cv = {fmtNum(t.cv)})</div>
              )}
              <div>Var(δ̂) = [M⁻¹]{sub(`${tName}, ${tName}`)} = {fmtNum(engineVar, 8)}</div>
              {rep.varDelta != null && (
                <div className="text-ink-600">
                  recomputed here, one cluster block at a time: {fmtNum(rep.varDelta, 8)}
                  <Agree ok={relDiff(rep.varDelta, engineVar) < 1e-8} engine={fmtNum(engineVar, 8)} />
                </div>
              )}
            </CalcMathBox>
            <Reveal label="M">{mInfo}</Reveal>
            <Reveal label={t.cv > 0 ? 'M⁻¹ (with cluster-size correction)' : 'M⁻¹'}>{mat(t.Minv, true)}</Reveal>
          </>
        )}

        {info.variance === 'kr' && (
          <>
            <CalcText>
              Kenward-Roger starts from the model-based variance and inflates it for the uncertainty in estimating the
              covariance parameters. The engine uses the first-order adjustment, with variance terms that the
              cluster-period means cannot tell apart merged into one and the open-cohort retention treated as known.
            </CalcText>
            <CalcMathBox>
              <div>M = Xᵀ Σ⁻¹ X <span className="text-ink-500">({P} × {P})</span></div>
              {rep.modelVar != null && <div>model-based Var(δ̂) = [M⁻¹]{sub(`${tName}, ${tName}`)} = {fmtNum(rep.modelVar, 8)}</div>}
              <div>Kenward-Roger Var(δ̂) = {fmtNum(engineVar, 8)}</div>
              {rep.modelVar != null && (
                <div className="text-ink-600">inflation over model-based: × {fmtNum(engineVar / rep.modelVar, 5)}</div>
              )}
            </CalcMathBox>
            <Reveal label="M">{mInfo}</Reveal>
            <Reveal label="adjusted covariance">{mat(t.Minv, true)}</Reveal>
          </>
        )}

        {info.variance === 'robust_ind' && (
          <>
            <CalcText>
              A sandwich variance: the estimate assumes independent observations, and the true covariance Σ goes in
              the middle.
            </CalcText>
            <CalcMathBox>
              <div>B = Xᵀ X, meat = Xᵀ Σ X</div>
              <div>Var(δ̂) = [B⁻¹ · meat · B⁻¹]{sub(`${tName}, ${tName}`)} = {fmtNum(engineVar, 8)}</div>
              {rep.varDelta != null && (
                <div className="text-ink-600">
                  recomputed here: {fmtNum(rep.varDelta, 8)}
                  <Agree ok={relDiff(rep.varDelta, engineVar) < 1e-8} engine={fmtNum(engineVar, 8)} />
                </div>
              )}
            </CalcMathBox>
            <Reveal label="B⁻¹">{mat(t.bread)}</Reveal>
            <Reveal label="meat">{mat(t.meat)}</Reveal>
            <Reveal label="sandwich">{mat(t.Minv, true)}</Reveal>
          </>
        )}

        {info.variance === 'gee_exch' && (
          <>
            <CalcText>
              A sandwich variance: the GEE estimate is weighted by the working covariance, and the true covariance
              goes in the middle.
            </CalcText>
            <CalcMathBox>
              <div>M = Xᵀ V{sub('w')}⁻¹ X, meat = Xᵀ V{sub('w')}⁻¹ Σ V{sub('w')}⁻¹ X</div>
              <div>Var(δ̂) = [M⁻¹ · meat · M⁻¹]{sub(`${tName}, ${tName}`)} = {fmtNum(engineVar, 8)}</div>
              {rep.varDelta != null && (
                <div className="text-ink-600">
                  recomputed here, one cluster block at a time: {fmtNum(rep.varDelta, 8)}
                  <Agree ok={relDiff(rep.varDelta, engineVar) < 1e-8} engine={fmtNum(engineVar, 8)} />
                </div>
              )}
            </CalcMathBox>
            <Reveal label="M">{mInfo}</Reveal>
            <Reveal label="meat">{mat(t.meat)}</Reveal>
            <Reveal label="sandwich">{mat(t.Minv, true)}</Reveal>
          </>
        )}

        {info.variance === 'deff' && (
          <>
            <CalcText>Generalised least squares on the {scale} scale, using the covariance V from step 3.</CalcText>
            <CalcMathBox>
              <div>M = Xᵀ V⁻¹ X <span className="text-ink-500">({P} × {P})</span></div>
              <div>Var(δ̂) = [M⁻¹]{sub(`${tName}, ${tName}`)} = {fmtNum(engineVar, 8)}</div>
              {rep.varDelta != null && (
                <div className="text-ink-600">
                  recomputed here, one cluster block at a time: {fmtNum(rep.varDelta, 8)}
                  <Agree ok={relDiff(rep.varDelta, engineVar) < 1e-8} engine={fmtNum(engineVar, 8)} />
                </div>
              )}
            </CalcMathBox>
            <Reveal label="M">{mInfo}</Reveal>
            <Reveal label="M⁻¹">{mat(t.Minv, true)}</Reveal>
          </>
        )}

        {rep.varDelta == null && (
          <p className="mt-2 text-xs text-ink-500 max-w-[78ch]">{TRACE_REASONS[rep.reason] || TRACE_REASONS.missing}</p>
        )}
      </CalcStep>

      <CalcStep n={5} title="Standard error">
        <CalcMathBox>
          SE = √Var(δ̂) = √{fmtNum(shownVar, 8)} = {fmtNum(test.se, 6)}
          {!test.seFromEngine && <Agree ok={relDiff(test.se, engine.se) < 1e-8} engine={fmtNum(engine.se, 6)} />}
        </CalcMathBox>
      </CalcStep>

      <CalcStep n={6} title="Test, power and minimum detectable effect">
        {test.invalidDof ? (
          <p className="flex items-start gap-1.5 text-[13px] leading-relaxed text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2 max-w-[78ch]">
            <Icon name="alert" className="w-4 h-4 mt-0.5" />
            <span>
              The Kenward-Roger approximation returned no valid degrees of freedom ({dofText(test.dof)}) for
              this design, so there is no t distribution to test against. The engine still reports power{' '}
              {fmtNum(engine.power, 6)}, which can’t be reproduced. Treat this design’s result with caution, or choose
              another estimator.
            </span>
          </p>
        ) : (
        <>
        <CalcText>
          A two-sided test at α = {fmtNum(t.alpha)}
          {test.dist === 'z'
            ? ' against the normal distribution. Degrees of freedom don’t enter the calculation.'
            : info.dist === 'bw'
            ? `, using a t distribution with cluster-periods minus fixed effects = ${t.nRows} − ${P} = ${test.dof} degrees of freedom.`
            : `, using a t distribution with ${fmtNum(test.dof, 5)} degrees of freedom from the Kenward-Roger approximation.`}{' '}
          The effect is{' '}
          {info.variance === 'deff'
            ? `the ${binary ? 'risk' : 'rate'} difference ${binary ? 'p' : 'μ'}₁ − ${binary ? 'p' : 'μ'}₀`
            : binary
            ? 'the conditional log odds ratio β₁'
            : count
            ? 'the conditional log rate ratio β₁'
            : 'the treatment coefficient'}
          .
        </CalcText>
        <CalcMathBox>
          <div>
            critical value {test.dist === 'z' ? <>z{sub('1−α/2')}</> : <>t{sub(`${fmtNum(test.dof, 5)}, 1−α/2`)}</>} ={' '}
            {fmtNum(test.crit, 6)}
          </div>
          <div>
            test statistic |δ| / SE = {fmtNum(Math.abs(t.te), 6)} / {fmtNum(test.se, 6)} = {fmtNum(test.stat, 6)}
          </div>
          <div>
            power = {test.dist === 'z' ? 'Φ' : 'F'}({fmtNum(test.stat, 6)} − {fmtNum(test.crit, 6)}) ={' '}
            <span className="font-medium">{fmtNum(test.power, 6)}</span>
            <Agree ok={Math.abs(test.power - engine.power) < 1e-7} engine={fmtNum(engine.power, 6)} />
          </div>
          <div>
            MDE at {fmtNum(t.targetPower * 100)}% power = ({fmtNum(test.crit, 6)} + {fmtNum(test.qPower, 6)}) ×{' '}
            {fmtNum(test.se, 6)} = {fmtNum(test.mde, 6)}
            <Agree ok={relDiff(test.mde, engine.mde) < 1e-7} engine={fmtNum(engine.mde, 6)} />
          </div>
          <div>
            CI half-width = {fmtNum(test.crit, 6)} × {fmtNum(test.se, 6)} = {fmtNum(test.ciWidth, 6)}
            <Agree ok={relDiff(test.ciWidth, engine.ciWidth) < 1e-7} engine={fmtNum(engine.ciWidth, 6)} />
          </div>
        </CalcMathBox>
        <p className="mt-1.5 text-[11px] text-ink-500 max-w-[78ch]">
          {test.dist === 'z' ? 'Φ is the standard normal distribution function' : `F is the t distribution function with ${fmtNum(test.dof, 5)} degrees of freedom`}.
          Power counts rejections in the direction of the effect; the opposite tail is ignored, as is standard.
        </p>
        </>
        )}
      </CalcStep>
    </ol>
  );
};

const CalculationPanel = ({
  designs,
  activeIndex,
  cachedResults,
  isStale,
  isCalculating,
  cacheVersion,
  wasmLoaded,
  estimatorLabel,
}) => {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('ct.calcPanelOpen') === '1'; } catch (e) { return false; }
  });
  const [trace, setTrace] = useState(null);
  const [traceKey, setTraceKey] = useState(null);
  const [error, setError] = useState(null);
  const [working, setWorking] = useState(false);
  const [seqView, setSeqView] = useState(0);
  const [pending, setPending] = useState(null); // large design waiting for a go-ahead
  const [confirmedKey, setConfirmedKey] = useState(null);
  // Read at compute time only, so editing a design never re-traces it before Recalculate
  const latest = useRef({});
  latest.current = { designs, estimatorLabel };

  const toggle = () =>
    setOpen((o) => {
      try { localStorage.setItem('ct.calcPanelOpen', o ? '0' : '1'); } catch (e) { /* storage unavailable */ }
      return !o;
    });

  useEffect(() => {
    if (!open || isStale || isCalculating || !wasmLoaded) return undefined;
    const key = `${cacheVersion}:${activeIndex}`;
    if (key === traceKey) return undefined;
    const entry = latest.current.designs[activeIndex];
    if (key !== confirmedKey) {
      // The export copies an n x n covariance matrix out of the engine, which
      // takes seconds for big designs: ask first rather than freeze the page
      const rows = MathsInterface._generateDataMatrix(entry.design, entry.options).length;
      if (rows > TRACE_CONFIRM_ROWS) {
        setPending({ key, rows });
        return undefined;
      }
    }
    setPending(null);
    let cancelled = false;
    setWorking(true);
    const id = setTimeout(() => {
      try {
        const t = MathsInterface.getCalculationTrace(entry.design, entry.options, `design-${activeIndex}`);
        if (cancelled) return;
        setTrace({ ...t, designName: entry.name, estimatorLabel: latest.current.estimatorLabel });
        setError(null);
      } catch (err) {
        console.error('Calculation trace failed:', err);
        if (cancelled) return;
        setTrace(null);
        setError(err && err.message ? err.message : String(err));
      }
      setTraceKey(key);
      setWorking(false);
    }, 30);
    return () => {
      cancelled = true;
      clearTimeout(id);
      setWorking(false);
    };
  }, [open, isStale, isCalculating, wasmLoaded, cacheVersion, activeIndex, traceKey, confirmedKey]);

  const showPending = pending && !isStale && pending.key === `${cacheVersion}:${activeIndex}`;

  const res = cachedResults[activeIndex] || {};
  const name = designs[activeIndex] ? designs[activeIndex].name : '';
  const summary = isStale
    ? 'Out of date · recalculate to update'
    : `${name} · ${estimatorLabel} · SE ${res.se} → power ${res.power}`;
  const status = trace ? traceStatus(trace.checks) : null;
  const pill = status ? STATUS_PILL[status] : null;

  return (
    <section className="panel">
      <h2 className="m-0">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="calculation-panel-body"
          className={`w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-ink-50 ${
            open ? 'border-b border-ink-100 rounded-t-lg' : 'rounded-lg'
          }`}
        >
          <Icon name="chevron" className={`w-4 h-4 text-ink-500 transition-transform ${open ? 'rotate-90' : ''}`} />
          <span className="panel-title">Calculation</span>
          <span className="text-xs font-normal text-ink-500">How the result was produced, step by step</span>
          <span className={`sm:ml-auto font-mono text-xs font-normal tabular-nums ${isStale ? 'text-ink-400' : 'text-ink-700'}`}>
            {summary}
          </span>
        </button>
      </h2>

      {open && (
        <div id="calculation-panel-body">
          {isStale && (
            <p className="flex items-center gap-1.5 px-4 py-2 border-b border-amber-100 text-xs text-amber-800 bg-amber-50">
              <Icon name="alert" className="w-3.5 h-3.5" />
              {trace
                ? 'These steps describe the last calculation. Recalculate to update them.'
                : 'Recalculate to see how the result is produced.'}
            </p>
          )}
          {error && (
            <p className="flex items-center gap-1.5 px-4 py-3 text-sm text-red-800 bg-red-50">
              <Icon name="alert" className="w-4 h-4" />
              The calculation steps couldn’t be produced for this design: {error}
            </p>
          )}
          {showPending && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
              <p className="text-[13px] leading-relaxed text-ink-600 max-w-[70ch]">
                This design has {pending.rows.toLocaleString()} cluster-periods. Showing the calculation means copying a{' '}
                {pending.rows.toLocaleString()} × {pending.rows.toLocaleString()} covariance matrix out of the engine,
                which can take several seconds, and the page won’t respond until it finishes.
              </p>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmedKey(pending.key)}>
                Show the calculation
              </button>
            </div>
          )}
          {!trace && !error && !isStale && !showPending && (
            <p className="px-4 py-6 text-sm text-ink-500">{wasmLoaded ? 'Working…' : 'Loading the statistics engine…'}</p>
          )}
          {trace && !showPending && (
            <div className={`transition-opacity ${isStale || working ? 'opacity-50' : ''}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-3">
                <span className="text-xs text-ink-600">
                  {trace.designName} · {trace.estimatorLabel}
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium ${pill.cls}`}>
                  <Icon name={pill.icon} className="w-3 h-3" />
                  {pill.text}
                </span>
              </div>
              <CalculationSteps t={trace} seqView={seqView} setSeqView={setSeqView} />
              <div className="px-4 py-3 border-t border-ink-100 bg-ink-50 rounded-b-lg">
                <h3 className="text-xs font-semibold text-ink-900 mb-2">Checks run in your browser</h3>
                <ul className="grid gap-x-6 gap-y-2 md:grid-cols-2">
                  {trace.checks.map((c, i) => (
                    <li key={i} className="flex gap-2 text-xs">
                      <Icon
                        name={c.status === 'ok' ? 'check' : c.status === 'fail' ? 'alert' : 'minus'}
                        className={`w-3.5 h-3.5 mt-0.5 ${
                          c.status === 'ok' ? 'text-accent-700' : c.status === 'fail' ? 'text-red-600' : 'text-ink-400'
                        }`}
                      />
                      <span className="min-w-0">
                        <span className={`font-medium ${c.status === 'fail' ? 'text-red-800' : 'text-ink-800'}`}>{c.label}</span>
                        <span className="block text-ink-600 leading-snug">{c.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[11px] leading-snug text-ink-500 max-w-[90ch]">
                  These checks use only the matrices the engine exports and JavaScript arithmetic, not the engine’s own
                  linear algebra. For an independent check in R, export the verification bundle.{' '}
                  <a href="/methods/verification.html" className="text-accent-700 hover:underline underline-offset-2">
                    How verification works
                  </a>
                </p>
              </div>
            </div>
          )}
        </div>
      )}
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
  // Sweeping the size means every cell takes that size, even in exact mode
  if (modifiedOptions.sampleSizeMode === "exact") {
    modifiedOptions.sampleSizeMode = "fixed";
    modifiedOptions.cvClusterSize = 0;
  }
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
      // The surface sweeps a uniform cell size, even in exact mode
      const modifiedOptions =
        d.options.sampleSizeMode === "exact"
          ? { ...d.options, meanClusterSize: size, sampleSizeMode: "fixed", cvClusterSize: 0 }
          : { ...d.options, meanClusterSize: size };
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
        ...menuAnchor(e),
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
        ...menuAnchor(e),
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
        // Leave out editing chrome (insert buttons, add lanes, menu chevrons),
        // and collapse the space it took rather than leave blank strips.
        onclone: (doc) =>
          doc
            .querySelectorAll("[data-export-ignore]")
            .forEach((el) => (el.style.display = "none")),
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
  const clustersPerSeq = grid.map((_, i) => design.getClusters(i));
  const minClustersPerSeq = Math.min(...clustersPerSeq);
  const maxClustersPerSeq = Math.max(...clustersPerSeq);

  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-7 pb-12">
        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.012em] text-ink-900">
              Cluster trial design tool
            </h1>
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
            <HoverTip
              key={i}
              tipId={`design-tab-tip-${i}`}
              showOnFocus={false}
              text={
                designs.length < 3
                  ? "Click the name to rename this design. Add up to three designs to compare their results side by side."
                  : "Click the name to rename this design. You are comparing the maximum of three designs; remove one to add another."
              }
            >
            <div
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
                aria-describedby={`design-tab-tip-${i}`}
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
            </HoverTip>
          ))}
          {designs.length < 3 && (
            <div className="relative mb-1.5 ml-1" ref={addMenuRef}>
              <HoverTip
                disabled={addMenuOpen}
                title="Compare designs"
                text={`Add a blank design or duplicate an existing one. You can compare up to three designs side by side (${3 - designs.length} more available), and rename any design by clicking its name.`}
              >
              <button
                onClick={() => setAddMenuOpen((prev) => !prev)}
                className="btn btn-sm border-transparent text-ink-600 hover:text-ink-900 hover:bg-ink-100"
                aria-expanded={addMenuOpen}
              >
                <Icon name="plus" className="w-3.5 h-3.5" />
                Add design
              </button>
              </HoverTip>
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
                  <HoverTip
                    align="end"
                    title="Optimal cell weights"
                    text="Shrinks each cell in proportion to its weight in the optimal design, which is how much that cluster-period contributes to estimating the treatment effect. Small cells add little information. Updates when you recalculate."
                  >
                  <button
                    onClick={() =>
                      setWeightMode(weightMode === "cell" ? "none" : "cell")
                    }
                    aria-pressed={weightMode === "cell"}
                    className={`btn btn-sm btn-toggle ${
                      weightMode === "cell" && resultsStale ? "opacity-60" : ""
                    }`}
                  >
                    {weightMode === "cell" && (
                      <Icon name="check" className="w-3 h-3" />
                    )}
                    Cell weights{weightMode === "cell" && resultsStale && " *"}
                  </button>
                  </HoverTip>
                  <HoverTip
                    align="end"
                    title="Optimal row weights"
                    text="Shrinks each sequence in proportion to the share of clusters it would get in the optimal design. In a stepped wedge the middle sequences are usually worth more than the first and last. Updates when you recalculate."
                  >
                  <button
                    onClick={() =>
                      setWeightMode(weightMode === "row" ? "none" : "row")
                    }
                    aria-pressed={weightMode === "row"}
                    className={`btn btn-sm btn-toggle ${
                      weightMode === "row" && resultsStale ? "opacity-60" : ""
                    }`}
                  >
                    {weightMode === "row" && (
                      <Icon name="check" className="w-3 h-3" />
                    )}
                    Row weights{weightMode === "row" && resultsStale && " *"}
                  </button>
                  </HoverTip>
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
              <div className="canvas flex-1 flex flex-col overflow-x-auto min-h-[220px]">
                {/* How to edit. Outside designGridRef, so not in the PNG. */}
                <p className="flex items-start gap-1.5 px-4 pt-3 text-xs leading-snug text-ink-600">
                  <Icon name="info" className="w-3.5 h-3.5 mt-px text-ink-400" />
                  <span>
                    Click a cell to change its arm. Click a sequence or period
                    label for more options, or use{" "}
                    <span className="inline-flex align-[-2px] items-center justify-center w-3.5 h-3.5 rounded-full bg-accent-600 text-white">
                      <Icon name="plus" className="w-2.5 h-2.5" />
                    </span>{" "}
                    to insert one.
                    {options.sampleSizeMode === "exact" &&
                      " Right-click a cell to set its cluster-period size."}
                  </span>
                </p>
                <div className="flex-1 flex items-center">
                <div ref={designGridRef} className="inline-block p-5 mx-auto">
                  {/* Column headers */}
                  <div className="flex items-center mb-1 group">
                    <ClustersColumnHeading />
                    <div className="flex items-center">
                      <div className="w-2 flex justify-center">
                        <InsertButton
                          label="Insert a period before T0"
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
                                label={`Insert a period after T${j}`}
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

                  {/* Grid rows, with the add-period lane down the right edge */}
                  <div className="flex items-stretch">
                  <div className="flex flex-col">
                    <div className="flex items-center h-2 group">
                      <div
                        style={{ width: SEQ_HEADER_W }}
                        className="flex justify-end pr-1"
                      >
                        <InsertButton
                          label="Insert a sequence above S1"
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
                              label={`Insert a sequence below S${i + 1}`}
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
                  <AddPeriodLane
                    onClick={() =>
                      updateActiveDesign((e) =>
                        e.design.insertPeriod(e.design.numPeriods)
                      )
                    }
                  />
                  </div>
                  <AddSequenceLane
                    numPeriods={numPeriods}
                    cellSize={cellSize}
                    onClick={() =>
                      updateActiveDesign((e) =>
                        e.design.insertSequence(e.design.numSequences)
                      )
                    }
                  />
                </div>
                </div>
              </div>

              {/* Legend and design summary */}
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5 border-t border-ink-100 text-xs">
                {/* The legend runs in click order: each click moves a cell one step right. */}
                <div
                  className="flex flex-wrap items-center gap-x-2 gap-y-1"
                  title="Clicking a cell moves it to the next state, then back to control"
                >
                  {statusCycle.map((status, k) => {
                    const config = statusConfig[status];
                    return (
                      <React.Fragment key={status}>
                        {k > 0 && (
                          <Icon name="chevron" className="w-3 h-3 text-ink-400" />
                        )}
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`w-3 h-3 rounded-[3px] border ${config.bg} ${config.border}`}
                          />
                          <span className="text-ink-600">{config.label}</span>
                        </span>
                      </React.Fragment>
                    );
                  })}
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
                  <span className="text-ink-500">
                    {" "}(
                    {minClustersPerSeq === maxClustersPerSeq
                      ? minClustersPerSeq
                      : `${minClustersPerSeq}–${maxClustersPerSeq}`}{" "}
                    per sequence)
                  </span>
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

        <div className="mt-5">
          <CalculationPanel
            designs={designs}
            activeIndex={activeIndex}
            cachedResults={cachedResults}
            isStale={resultsStale}
            isCalculating={isCalculating}
            cacheVersion={cacheVersion}
            wasmLoaded={wasmLoaded}
            estimatorLabel={
              (getEstimators(options.outcomeType).find((e) => e.key === options.estimator) || {}).label ||
              options.estimator
            }
          />
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
          key={`${contextMenu.x},${contextMenu.y}`}
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