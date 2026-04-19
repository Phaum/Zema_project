/**
 * Mahalanobis Distance Calculation
 * Used for analog selection based on multiple characteristics
 */

/**
 * Calculate mean of array
 */
function mean(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

/**
 * Calculate variance
 */
function variance(arr) {
    if (!arr || arr.length === 0) return 0;
    const m = mean(arr);
    const squareDiffs = arr.map((val) => Math.pow(val - m, 2));
    return mean(squareDiffs);
}

/**
 * Calculate covariance between two arrays
 */
function covariance(arr1, arr2) {
    if (!arr1 || !arr2 || arr1.length !== arr2.length || arr1.length === 0) return 0;
    const m1 = mean(arr1);
    const m2 = mean(arr2);
    const products = arr1.map((val, i) => (val - m1) * (arr2[i] - m2));
    return mean(products);
}

/**
 * Build covariance matrix from data
 */
function covarianceMatrix(data) {
    if (!data || data.length === 0 || !data[0]) return null;

    const numFeatures = data[0].length;
    const matrix = Array(numFeatures)
        .fill(null)
        .map(() => Array(numFeatures).fill(0));

    for (let i = 0; i < numFeatures; i++) {
        for (let j = 0; j < numFeatures; j++) {
            const col_i = data.map((row) => row[i]);
            const col_j = data.map((row) => row[j]);
            matrix[i][j] = covariance(col_i, col_j);
        }
    }

    return matrix;
}

function cloneMatrix(matrix) {
    return matrix.map((row) => [...row]);
}

function determinant(matrix) {
    const size = matrix.length;
    if (size === 2) return det2x2(matrix);
    if (size === 3) return det3x3(matrix);
    return luDeterminant(matrix);
}

function regularizeCovarianceMatrix(matrix) {
    const attempts = [0, 1e-8, 1e-6, 1e-4, 1e-3];

    for (const epsilon of attempts) {
        const candidate = cloneMatrix(matrix);

        if (epsilon > 0) {
            for (let i = 0; i < candidate.length; i += 1) {
                candidate[i][i] += epsilon;
            }
        }

        const det = determinant(candidate);
        if (Math.abs(det) >= 1e-10) {
            return { matrix: candidate, det, epsilon };
        }
    }

    return { matrix, det: determinant(matrix), epsilon: 0 };
}

/**
 * Calculate determinant of 2x2 matrix
 */
function det2x2(matrix) {
    return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
}

/**
 * Calculate determinant of 3x3 matrix
 */
function det3x3(matrix) {
    return (
        matrix[0][0] *
            (matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1]) -
        matrix[0][1] *
            (matrix[1][0] * matrix[2][2] - matrix[1][2] * matrix[2][0]) +
        matrix[0][2] *
            (matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0])
    );
}

/**
 * Invert 2x2 matrix
 */
function invert2x2(matrix) {
    const d = det2x2(matrix);
    if (d === 0) return null;
    return [
        [matrix[1][1] / d, -matrix[0][1] / d],
        [-matrix[1][0] / d, matrix[0][0] / d],
    ];
}

/**
 * Invert 3x3 matrix (helper for larger matrices)
 */
function invert3x3(matrix) {
    const d = det3x3(matrix);
    if (d === 0) return null;

    const result = [
        [
            (matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1]) / d,
            (matrix[0][2] * matrix[2][1] - matrix[0][1] * matrix[2][2]) / d,
            (matrix[0][1] * matrix[1][2] - matrix[0][2] * matrix[1][1]) / d,
        ],
        [
            (matrix[1][2] * matrix[2][0] - matrix[1][0] * matrix[2][2]) / d,
            (matrix[0][0] * matrix[2][2] - matrix[0][2] * matrix[2][0]) / d,
            (matrix[0][2] * matrix[1][0] - matrix[0][0] * matrix[1][2]) / d,
        ],
        [
            (matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0]) / d,
            (matrix[0][1] * matrix[2][0] - matrix[0][0] * matrix[2][1]) / d,
            (matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0]) / d,
        ],
    ];

    return result;
}

/**
 * Matrix-vector multiplication
 */
function matrixVectorMult(matrix, vector) {
    return matrix.map((row) => row.reduce((sum, val, i) => sum + val * vector[i], 0));
}

/**
 * Vector dot product
 */
function dotProduct(v1, v2) {
    return v1.reduce((sum, val, i) => sum + val * v2[i], 0);
}

/**
 * Vector subtraction
 */
function vectorSub(v1, v2) {
    return v1.map((val, i) => val - v2[i]);
}

/**
 * Normalize features (standardize to mean=0, std=1)
 */
export function normalizeFeatures(data) {
    if (!data || data.length === 0 || !data[0]) return null;

    const numFeatures = data[0].length;
    const normalized = [];

    for (let j = 0; j < numFeatures; j++) {
        const column = data.map((row) => row[j]);
        const m = mean(column);
        const std = Math.sqrt(variance(column));

        if (std === 0) {
            // Handle zero variance
            normalized[j] = column.map(() => 0);
        } else {
            normalized[j] = column.map((val) => (val - m) / std);
        }
    }

    // Transpose back to row format
    const result = data.map((_, i) => normalized.map((col) => col[i]));
    return result;
}

/**
 * Calculate Mahalanobis distance
 * @param {Array} objectVector - Feature vector of the object (1D array)
 * @param {Array} data - Feature matrix of analogs (2D array)
 * @returns {Array} Array of distances for each analog
 */
export function mahalanobisDistance(objectVector, data) {
    if (!data || data.length < 2) {
        throw new Error('Требуется минимум 2 аналога для расчета Махаланобиса');
    }

    const numFeatures = objectVector.length;
    if (data.some((row) => row.length !== numFeatures)) {
        throw new Error('Несовместимые размеры параметров объекта и аналогов');
    }

    // Normalize data
    const normalized = normalizeFeatures(data);
    const normalizedObject = [];

    // Normalize object vector using same parameters
    for (let j = 0; j < numFeatures; j++) {
        const column = data.map((row) => row[j]);
        const m = mean(column);
        const std = Math.sqrt(variance(column));

        normalizedObject[j] = std === 0 ? 0 : (objectVector[j] - m) / std;
    }

    // Calculate covariance matrix
    const covMatrix = covarianceMatrix(normalized);
    if (!covMatrix) {
        throw new Error('Не удалось рассчитать ковариационную матрицу');
    }

    const { matrix: stabilizedCovMatrix, det } = regularizeCovarianceMatrix(covMatrix);

    if (Math.abs(det) < 1e-10) {
        throw new Error('Вырожденная ковариационная матрица (det=0)');
    }

    // Invert covariance matrix
    let invMatrix = null;
    if (numFeatures === 2) {
        invMatrix = invert2x2(stabilizedCovMatrix);
    } else if (numFeatures === 3) {
        invMatrix = invert3x3(stabilizedCovMatrix);
    } else {
        invMatrix = invertMatrix(stabilizedCovMatrix);
    }

    if (!invMatrix) {
        throw new Error('Не удалось инвертировать ковариационную матрицу');
    }

    // Calculate distance for each analog
    const distances = normalized.map((analog) => {
        const diff = vectorSub(normalizedObject, analog);
        const intermediate = matrixVectorMult(invMatrix, diff);
        const dist_squared = dotProduct(diff, intermediate);
        return Math.sqrt(Math.max(0, dist_squared)); // Ensure non-negative
    });

    return distances;
}

/**
 * LU decomposition determinant (for larger matrices)
 */
function luDeterminant(matrix) {
    const n = matrix.length;
    const lu = matrix.map((row) => [...row]);
    let det = 1;

    for (let k = 0; k < n; k++) {
        // Find pivot
        let maxRow = k;
        for (let i = k + 1; i < n; i++) {
            if (Math.abs(lu[i][k]) > Math.abs(lu[maxRow][k])) {
                maxRow = i;
            }
        }

        if (Math.abs(lu[maxRow][k]) < 1e-10) {
            return 0;
        }

        if (k !== maxRow) {
            [lu[k], lu[maxRow]] = [lu[maxRow], lu[k]];
            det *= -1;
        }

        det *= lu[k][k];

        for (let i = k + 1; i < n; i++) {
            const factor = lu[i][k] / lu[k][k];
            for (let j = k + 1; j < n; j++) {
                lu[i][j] -= factor * lu[k][j];
            }
        }
    }

    return det;
}

/**
 * Invert matrix using Gaussian elimination
 */
function invertMatrix(matrix) {
    const n = matrix.length;
    const aug = matrix.map((row, i) => [
        ...row,
        ...Array(n)
            .fill(0)
            .map((_, j) => (i === j ? 1 : 0)),
    ]);

    // Forward elimination
    for (let i = 0; i < n; i++) {
        // Find pivot
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) {
                maxRow = k;
            }
        }

        if (Math.abs(aug[maxRow][i]) < 1e-10) {
            return null;
        }

        [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];

        // Scale pivot row
        const pivot = aug[i][i];
        for (let j = 0; j < 2 * n; j++) {
            aug[i][j] /= pivot;
        }

        // Eliminate column
        for (let k = 0; k < n; k++) {
            if (k !== i) {
                const factor = aug[k][i];
                for (let j = 0; j < 2 * n; j++) {
                    aug[k][j] -= factor * aug[i][j];
                }
            }
        }
    }

    // Extract inverse matrix
    return aug.map((row) => row.slice(n));
}
