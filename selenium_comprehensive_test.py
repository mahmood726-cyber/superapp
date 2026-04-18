"""
Comprehensive Selenium Test for Meta-Analysis Superapp
Tests all major functions in advanced-methods.js
"""

import time
import json
import sys
import http.server
import socketserver
import threading
import os
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, JavascriptException

# Test configuration
PORT = 8765
APP_DIR = "C:/Users/user/Downloads/superapp"
APP_URL = f"http://localhost:{PORT}/index.html"
TIMEOUT = 60

class QuietHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress logging

class MetaAnalysisTestSuite:
    def __init__(self):
        self.driver = None
        self.server = None
        self.server_thread = None
        self.results = []
        self.passed = 0
        self.failed = 0

    def start_server(self):
        """Start local HTTP server"""
        os.chdir(APP_DIR)
        handler = QuietHTTPHandler
        self.server = socketserver.TCPServer(("", PORT), handler)
        self.server_thread = threading.Thread(target=self.server.serve_forever)
        self.server_thread.daemon = True
        self.server_thread.start()
        time.sleep(1)  # Wait for server to start

    def stop_server(self):
        """Stop local HTTP server"""
        if self.server:
            self.server.shutdown()

    def setup(self):
        """Initialize Chrome WebDriver"""
        options = Options()
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-web-security")
        options.add_argument("--allow-file-access-from-files")
        # options.add_argument("--headless")  # Uncomment for headless testing

        self.driver = webdriver.Chrome(options=options)
        self.driver.set_window_size(1400, 900)
        self.driver.set_script_timeout(TIMEOUT)

    def teardown(self):
        """Close browser"""
        if self.driver:
            self.driver.quit()
        self.stop_server()

    def log_result(self, test_name, passed, message="", details=None):
        """Log test result"""
        status = "PASS" if passed else "FAIL"
        result = {
            "test": test_name,
            "status": status,
            "message": message,
            "details": details
        }
        self.results.append(result)
        if passed:
            self.passed += 1
            print(f"  [PASS] {test_name}: {message}")
        else:
            self.failed += 1
            print(f"  [FAIL] {test_name}: {message}")

    def execute_js(self, script, timeout=30):
        """Execute JavaScript and return result"""
        try:
            return self.driver.execute_script(script)
        except JavascriptException as e:
            return {"error": str(e)}
        except Exception as e:
            return {"error": str(e)}

    def wait_for_app(self):
        """Wait for app to load"""
        try:
            WebDriverWait(self.driver, TIMEOUT).until(
                EC.presence_of_element_located((By.ID, "app"))
            )
            time.sleep(2)
            return True
        except TimeoutException:
            return False

    def import_engine_module(self):
        """Import the advanced-methods module into the page"""
        # Use a synchronous approach with callback
        script = """
        var callback = arguments[arguments.length - 1];
        import('./js/engine/advanced-methods.js')
            .then(function(module) {
                window.metaEngine = module;
                callback({ success: true, functions: Object.keys(module).length });
            })
            .catch(function(e) {
                callback({ success: false, error: e.message });
            });
        """
        try:
            result = self.driver.execute_async_script(script)
            return result
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ========== CORE META-ANALYSIS TESTS ==========

    def test_random_effects_meta(self):
        """Test basic random-effects meta-analysis"""
        script = """
        const yi = [0.5, 0.3, 0.7, 0.4, 0.6, 0.2, 0.8, 0.35, 0.55, 0.45];
        const vi = [0.04, 0.05, 0.03, 0.06, 0.04, 0.05, 0.04, 0.05, 0.04, 0.05];
        try {
            const result = window.metaEngine.randomEffectsMeta(yi, vi);
            return {
                success: true,
                estimate: result.estimate,
                tau2: result.tau2,
                I2: result.I2,
                hasCI: Array.isArray(result.ci) && result.ci.length === 2
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
        """
        result = self.execute_js(script)
        if result and result.get("success"):
            est = result.get("estimate", 0)
            valid = 0.3 < est < 0.6 and result.get("hasCI")
            self.log_result("randomEffectsMeta", valid,
                f"estimate={est:.4f}, tau2={result.get('tau2', 0):.4f}, I2={result.get('I2', 0):.1f}%")
        else:
            self.log_result("randomEffectsMeta", False,
                result.get("error", "Unknown error") if result else "No result")

    def test_tau2_estimators(self):
        """Test all tau² estimators"""
        estimators = ['DL', 'REML', 'PM', 'SJ', 'HS', 'HE', 'ML', 'EB']
        script = """
        const yi = [0.5, 0.3, 0.7, 0.4, 0.6, 0.2, 0.8, 0.35, 0.55, 0.45];
        const vi = [0.04, 0.05, 0.03, 0.06, 0.04, 0.05, 0.04, 0.05, 0.04, 0.05];
        const methods = ['DL', 'REML', 'PM', 'SJ', 'HS', 'HE', 'ML', 'EB'];
        const results = {};
        let errors = [];

        for (const method of methods) {
            try {
                results[method] = window.metaEngine.estimateTau2(yi, vi, method);
            } catch (e) {
                errors.push(method + ': ' + e.message);
            }
        }
        return { success: errors.length === 0, results: results, errors: errors };
        """
        result = self.execute_js(script)
        if result and result.get("success"):
            vals = result.get("results", {})
            summary = ", ".join([f"{k}={v:.4f}" for k, v in list(vals.items())[:4]])
            self.log_result("tau2Estimators", True, f"8 methods tested: {summary}...")
        else:
            self.log_result("tau2Estimators", False,
                str(result.get("errors", [])) if result else "No result")

    def test_publication_bias(self):
        """Test publication bias methods"""
        script = """
        const yi = [0.5, 0.3, 0.7, 0.4, 0.6, 0.2, 0.8, 0.35, 0.55, 0.45];
        const vi = [0.04, 0.05, 0.03, 0.06, 0.04, 0.05, 0.04, 0.05, 0.04, 0.05];
        const results = {};
        let errors = [];

        try {
            results.egger = window.metaEngine.eggerTest(yi, vi);
        } catch (e) { errors.push('egger: ' + e.message); }

        try {
            results.petPeese = window.metaEngine.petPeese(yi, vi);
        } catch (e) { errors.push('petPeese: ' + e.message); }

        try {
            results.trimFill = window.metaEngine.trimAndFill(yi, vi);
        } catch (e) { errors.push('trimFill: ' + e.message); }

        return {
            success: Object.keys(results).length >= 2,
            results: {
                eggerP: results.egger ? results.egger.pValue : null,
                petEst: results.petPeese ? results.petPeese.petEstimate : null,
                trimFillK: results.trimFill ? results.trimFill.k0 : null
            },
            errors: errors
        };
        """
        result = self.execute_js(script)
        if result and result.get("success"):
            r = result.get("results", {})
            self.log_result("publicationBias", True,
                f"Egger p={r.get('eggerP', 'N/A')}, PET={r.get('petEst', 'N/A')}, TrimFill k0={r.get('trimFillK', 'N/A')}")
        else:
            self.log_result("publicationBias", False,
                str(result.get("errors", [])) if result else "No result")

    def test_selection_models(self):
        """Test selection models (Copas, 3PSM)"""
        script = """
        const yi = [0.5, 0.3, 0.7, 0.4, 0.6, 0.2, 0.8, 0.35, 0.55, 0.45,
                    0.42, 0.58, 0.33, 0.67, 0.48];
        const vi = [0.04, 0.05, 0.03, 0.06, 0.04, 0.05, 0.04, 0.05, 0.04, 0.05,
                    0.04, 0.05, 0.04, 0.05, 0.04];
        const results = {};
        let errors = [];

        try {
            results.copas = window.metaEngine.copasSelectionModel(yi, vi);
        } catch (e) { errors.push('copas: ' + e.message); }

        try {
            results.copasContour = window.metaEngine.copasContourAnalysis(yi, vi, {
                gammaRange: [-2, 0],
                rhoRange: [0.5, 1],
                gridSize: 5
            });
        } catch (e) { errors.push('copasContour: ' + e.message); }

        return {
            success: results.copas !== undefined,
            results: {
                copasAdj: results.copas ? results.copas.adjustedEstimate : null,
                contourGrid: results.copasContour ? results.copasContour.grid : null
            },
            errors: errors
        };
        """
        result = self.execute_js(script)
        if result and result.get("success"):
            r = result.get("results", {})
            self.log_result("selectionModels", True,
                f"Copas adjusted={r.get('copasAdj', 'N/A')}, contour grid available")
        else:
            self.log_result("selectionModels", False,
                str(result.get("errors", [])) if result else "No result")

    def test_bayesian_meta(self):
        """Test Bayesian meta-analysis (quick version)"""
        script = """
        const yi = [0.5, 0.3, 0.7, 0.4, 0.6, 0.2, 0.8];
        const vi = [0.04, 0.05, 0.03, 0.06, 0.04, 0.05, 0.04];

        try {
            const result = window.metaEngine.bayesianMetaAnalysis(yi, vi, {
                nIter: 500,
                burnIn: 100,
                nChains: 2,
                sampler: 'gibbs'
            });
            return {
                success: true,
                muMean: result.posteriorSummary.mu.mean,
                tauMean: result.posteriorSummary.tau.mean,
                converged: result.diagnostics.convergence.allConverged
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
        """
        result = self.execute_js(script)
        if result and result.get("success"):
            self.log_result("bayesianMeta", True,
                f"mu={result.get('muMean', 0):.4f}, tau={result.get('tauMean', 0):.4f}, converged={result.get('converged')}")
        else:
            self.log_result("bayesianMeta", False,
                result.get("error", "Unknown error") if result else "No result")

    def test_bivariate_dta(self):
        """Test bivariate DTA meta-analysis"""
        script = """
        const tp = [66, 118, 48, 134, 24, 68, 64, 282, 14, 262];
        const fp = [240, 10, 64, 28, 44, 48, 0, 20, 44, 30];
        const fn = [4, 12, 20, 8, 6, 16, 18, 64, 2, 20];
        const tn = [870, 110, 990, 152, 292, 154, 72, 286, 286, 178];

        try {
            const result = window.metaEngine.bivariateDTA(tp, fp, fn, tn);
            return {
                success: true,
                sensitivity: result.pooled.sensitivity.estimate,
                specificity: result.pooled.specificity.estimate,
                auc: result.pooled.auc.estimate,
                correlation: result.heterogeneity.correlation
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
        """
        result = self.execute_js(script)
        if result and result.get("success"):
            sens = result.get("sensitivity", 0)
            spec = result.get("specificity", 0)
            valid = 0.6 < sens < 0.99 and 0.6 < spec < 0.99
            self.log_result("bivariateDTA", valid,
                f"sens={sens:.4f}, spec={spec:.4f}, AUC={result.get('auc', 0):.4f}")
        else:
            self.log_result("bivariateDTA", False,
                result.get("error", "Unknown error") if result else "No result")

    def test_dta_leave_one_out(self):
        """Test DTA leave-one-out sensitivity analysis"""
        script = """
        const tp = [66, 118, 48, 134, 24, 68, 64, 282];
        const fp = [240, 10, 64, 28, 44, 48, 0, 20];
        const fn = [4, 12, 20, 8, 6, 16, 18, 64];
        const tn = [870, 110, 990, 152, 292, 154, 72, 286];

        try {
            const result = window.metaEngine.dtaLeaveOneOut(tp, fp, fn, tn);
            return {
                success: true,
                nConverged: result.nConverged,
                nInfluential: result.influentialStudies.length,
                fullSens: result.fullModel.sensitivity
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
        """
        result = self.execute_js(script)
        if result and result.get("success"):
            self.log_result("dtaLeaveOneOut", result.get("nConverged", 0) > 0,
                f"converged={result.get('nConverged')}, influential={result.get('nInfluential')}")
        else:
            self.log_result("dtaLeaveOneOut", False,
                result.get("error", "Unknown error") if result else "No result")

    def test_network_meta_analysis(self):
        """Test network meta-analysis"""
        script = """
        const studies = [
            { study: 'S1', treat1: 'A', treat2: 'B', effect: 0.5, se: 0.1 },
            { study: 'S2', treat1: 'A', treat2: 'B', effect: 0.4, se: 0.12 },
            { study: 'S3', treat1: 'B', treat2: 'C', effect: 0.3, se: 0.11 },
            { study: 'S4', treat1: 'B', treat2: 'C', effect: 0.35, se: 0.1 },
            { study: 'S5', treat1: 'A', treat2: 'C', effect: 0.8, se: 0.13 },
            { study: 'S6', treat1: 'A', treat2: 'C', effect: 0.75, se: 0.11 },
            { study: 'S7', treat1: 'A', treat2: 'D', effect: 0.6, se: 0.12 },
            { study: 'S8', treat1: 'C', treat2: 'D', effect: -0.2, se: 0.1 }
        ];

        try {
            const result = window.metaEngine.networkMetaAnalysisMultiArm(studies, { reference: 'A' });
            return {
                success: true,
                nTreatments: result.treatments.length,
                nContrasts: result.contrasts.length
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
        """
        result = self.execute_js(script)
        if result and result.get("success"):
            self.log_result("networkMetaAnalysis", result.get("nContrasts", 0) > 0,
                f"treatments={result.get('nTreatments')}, contrasts={result.get('nContrasts')}")
        else:
            self.log_result("networkMetaAnalysis", False,
                result.get("error", "Unknown error") if result else "No result")

    def test_node_splitting(self):
        """Test node-splitting for NMA inconsistency"""
        script = """
        const contrasts = [
            { study: 'S1', treat1: 'A', treat2: 'B', effect: 0.5, se: 0.1 },
            { study: 'S2', treat1: 'A', treat2: 'B', effect: 0.4, se: 0.12 },
            { study: 'S3', treat1: 'B', treat2: 'C', effect: 0.3, se: 0.11 },
            { study: 'S4', treat1: 'B', treat2: 'C', effect: 0.35, se: 0.1 },
            { study: 'S5', treat1: 'A', treat2: 'C', effect: 0.8, se: 0.13 },
            { study: 'S6', treat1: 'A', treat2: 'C', effect: 0.75, se: 0.11 }
        ];

        try {
            const result = window.metaEngine.nodeSplitting(contrasts);
            return {
                success: true,
                nComparisons: result.nComparisons,
                nTested: result.nTested,
                hasInconsistency: result.summary.hasInconsistency
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
        """
        result = self.execute_js(script)
        if result and result.get("success"):
            self.log_result("nodeSplitting", True,
                f"comparisons={result.get('nComparisons')}, tested={result.get('nTested')}, inconsistent={result.get('hasInconsistency')}")
        else:
            self.log_result("nodeSplitting", False,
                result.get("error", "Unknown error") if result else "No result")

    def test_design_by_treatment(self):
        """Test design-by-treatment interaction"""
        script = """
        const contrasts = [
            { study: 'S1', treat1: 'A', treat2: 'B', effect: 0.5, se: 0.1 },
            { study: 'S2', treat1: 'A', treat2: 'B', effect: 0.4, se: 0.12 },
            { study: 'S3', treat1: 'B', treat2: 'C', effect: 0.3, se: 0.11 },
            { study: 'S4', treat1: 'B', treat2: 'C', effect: 0.35, se: 0.1 },
            { study: 'S5', treat1: 'A', treat2: 'C', effect: 0.8, se: 0.13 }
        ];

        try {
            const result = window.metaEngine.designByTreatmentInteraction(contrasts);
            return {
                success: true,
                nDesigns: result.nDesigns,
                betweenP: result.betweenDesignInconsistency.pValue,
                hasInconsistency: result.summary.hasInconsistency
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
        """
        result = self.execute_js(script)
        if result and result.get("success"):
            self.log_result("designByTreatment", True,
                f"designs={result.get('nDesigns')}, p={result.get('betweenP', 0):.4f}")
        else:
            self.log_result("designByTreatment", False,
                result.get("error", "Unknown error") if result else "No result")

    def test_multi_moderator_regression(self):
        """Test multi-moderator meta-regression"""
        script = """
        const yi = [0.5, 0.3, 0.7, 0.4, 0.6, 0.2, 0.8, 0.35, 0.55, 0.45];
        const vi = [0.04, 0.05, 0.03, 0.06, 0.04, 0.05, 0.04, 0.05, 0.04, 0.05];
        const moderators = {
            year: [2010, 2012, 2011, 2013, 2014, 2010, 2015, 2012, 2013, 2011],
            quality: ['high', 'low', 'high', 'medium', 'high', 'low', 'high', 'medium', 'low', 'high']
        };

        try {
            const result = window.metaEngine.multiModeratorMetaRegression(yi, vi, moderators);
            return {
                success: true,
                nCoef: result.coefficients.length,
                R2: result.modelFit.R2,
                modelP: result.modelTest.pValue,
                tau2: result.residualHeterogeneity.tau2
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
        """
        result = self.execute_js(script)
        if result and result.get("success"):
            self.log_result("multiModeratorRegression", True,
                f"coefs={result.get('nCoef')}, R2={result.get('R2', 0):.4f}, p={result.get('modelP', 0):.4f}")
        else:
            self.log_result("multiModeratorRegression", False,
                result.get("error", "Unknown error") if result else "No result")

    def test_gosh_analysis(self):
        """Test GOSH analysis with stratified sampling"""
        script = """
        const yi = [0.5, 0.3, 0.7, 0.4, 0.6, 0.2, 0.8, 0.35];
        const vi = [0.04, 0.05, 0.03, 0.06, 0.04, 0.05, 0.04, 0.05];

        try {
            const result = window.metaEngine.goshAnalysis(yi, vi, { maxSubsets: 200 });
            return {
                success: true,
                nSubsets: result.densityPlot ? result.densityPlot.length : 0,
                thetaMean: result.summary.theta.mean,
                thetaSD: result.summary.theta.sd
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
        """
        result = self.execute_js(script)
        if result and result.get("success"):
            self.log_result("goshAnalysis", result.get("nSubsets", 0) > 0,
                f"mean={result.get('thetaMean', 0):.4f}, SD={result.get('thetaSD', 0):.4f}")
        else:
            self.log_result("goshAnalysis", False,
                result.get("error", "Unknown error") if result else "No result")

    def test_three_level_meta(self):
        """Test three-level meta-analysis"""
        script = """
        const studies = [
            { study: 1, effect: 0.5, se: 0.1, cluster: 'A' },
            { study: 2, effect: 0.4, se: 0.12, cluster: 'A' },
            { study: 3, effect: 0.6, se: 0.11, cluster: 'A' },
            { study: 4, effect: 0.3, se: 0.1, cluster: 'B' },
            { study: 5, effect: 0.35, se: 0.13, cluster: 'B' },
            { study: 6, effect: 0.45, se: 0.11, cluster: 'C' },
            { study: 7, effect: 0.55, se: 0.12, cluster: 'C' },
            { study: 8, effect: 0.5, se: 0.1, cluster: 'C' }
        ];

        try {
            const result = window.metaEngine.threeLevelMA(studies);
            return {
                success: true,
                estimate: result.pooledEstimate,
                sigma2Within: result.varianceComponents.sigma2Within,
                sigma2Between: result.varianceComponents.sigma2Between
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
        """
        result = self.execute_js(script)
        if result and result.get("success"):
            self.log_result("threeLevelMA", True,
                f"estimate={result.get('estimate', 0):.4f}, within={result.get('sigma2Within', 0):.4f}, between={result.get('sigma2Between', 0):.4f}")
        else:
            self.log_result("threeLevelMA", False,
                result.get("error", "Unknown error") if result else "No result")

    def test_meta_cart(self):
        """Test Meta-CART moderator detection"""
        script = """
        const yi = [0.5, 0.3, 0.7, 0.4, 0.6, 0.2, 0.8, 0.35, 0.55, 0.45];
        const vi = [0.04, 0.05, 0.03, 0.06, 0.04, 0.05, 0.04, 0.05, 0.04, 0.05];
        const moderators = {
            year: [2010, 2012, 2011, 2013, 2014, 2010, 2015, 2012, 2013, 2011],
            sampleSize: [100, 50, 200, 75, 150, 60, 180, 90, 120, 110]
        };

        try {
            const result = window.metaEngine.metaCART(yi, vi, moderators, { maxDepth: 3 });
            return {
                success: true,
                nLeaves: result.tree.leaves ? result.tree.leaves.length : 1,
                hasImportance: result.moderatorImportance && result.moderatorImportance.length > 0
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
        """
        result = self.execute_js(script)
        if result and result.get("success"):
            self.log_result("metaCART", True,
                f"leaves={result.get('nLeaves')}, hasImportance={result.get('hasImportance')}")
        else:
            self.log_result("metaCART", False,
                result.get("error", "Unknown error") if result else "No result")

    def test_network_inconsistency(self):
        """Test network inconsistency analysis"""
        script = """
        const contrasts = [
            { study: 'S1', treat1: 'A', treat2: 'B', effect: 0.5, se: 0.1 },
            { study: 'S2', treat1: 'A', treat2: 'B', effect: 0.4, se: 0.12 },
            { study: 'S3', treat1: 'B', treat2: 'C', effect: 0.3, se: 0.11 },
            { study: 'S4', treat1: 'A', treat2: 'C', effect: 0.8, se: 0.13 }
        ];

        try {
            const result = window.metaEngine.networkInconsistencyAnalysis(contrasts);
            return {
                success: true,
                nLoops: result.nLoops,
                globalP: result.globalTest.pValue
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
        """
        result = self.execute_js(script)
        if result and result.get("success"):
            self.log_result("networkInconsistency", True,
                f"loops={result.get('nLoops')}, globalP={result.get('globalP', 0):.4f}")
        else:
            self.log_result("networkInconsistency", False,
                result.get("error", "Unknown error") if result else "No result")

    def run_all_tests(self):
        """Run all tests"""
        print("\n" + "="*70)
        print("META-ANALYSIS SUPERAPP - COMPREHENSIVE SELENIUM TESTS")
        print("="*70 + "\n")

        # Start server
        print("Starting local HTTP server...")
        self.start_server()
        print(f"Server running at http://localhost:{PORT}\n")

        # Setup browser
        print("Setting up Chrome browser...")
        self.setup()

        # Load app
        print(f"Loading app from {APP_URL}...")
        self.driver.get(APP_URL)

        if not self.wait_for_app():
            print("ERROR: App failed to load!")
            self.teardown()
            return False

        print("App loaded successfully!\n")

        # Import engine module
        print("Importing advanced-methods.js module...")
        import_result = self.import_engine_module()
        if not import_result or not import_result.get("success"):
            print(f"ERROR: Failed to import module: {import_result.get('error') if import_result else 'Unknown'}")
            self.teardown()
            return False
        print(f"Module imported successfully ({import_result.get('functions')} functions)\n")

        # Run tests
        print("-"*70)
        print("RUNNING TESTS")
        print("-"*70)

        test_categories = [
            ("Core Meta-Analysis", [
                self.test_random_effects_meta,
                self.test_tau2_estimators,
            ]),
            ("Publication Bias", [
                self.test_publication_bias,
                self.test_selection_models,
            ]),
            ("Bayesian Methods", [
                self.test_bayesian_meta,
            ]),
            ("DTA Meta-Analysis", [
                self.test_bivariate_dta,
                self.test_dta_leave_one_out,
            ]),
            ("Network Meta-Analysis", [
                self.test_network_meta_analysis,
                self.test_network_inconsistency,
                self.test_node_splitting,
                self.test_design_by_treatment,
            ]),
            ("Advanced Methods", [
                self.test_multi_moderator_regression,
                self.test_gosh_analysis,
                self.test_three_level_meta,
                self.test_meta_cart,
            ]),
        ]

        for category, tests in test_categories:
            print(f"\n{category}:")
            for test in tests:
                try:
                    test()
                except Exception as e:
                    self.log_result(test.__name__, False, str(e))

        # Summary
        print("\n" + "="*70)
        print("TEST SUMMARY")
        print("="*70)
        total = self.passed + self.failed
        rate = (self.passed / total * 100) if total > 0 else 0
        print(f"  Passed: {self.passed}")
        print(f"  Failed: {self.failed}")
        print(f"  Total:  {total}")
        print(f"  Rate:   {rate:.1f}%")

        if self.failed > 0:
            print("\n  Failed tests:")
            for r in self.results:
                if r["status"] == "FAIL":
                    print(f"    - {r['test']}: {r['message']}")

        print("="*70 + "\n")

        # Cleanup
        time.sleep(2)
        self.teardown()

        return self.failed == 0


if __name__ == "__main__":
    suite = MetaAnalysisTestSuite()
    success = suite.run_all_tests()
    sys.exit(0 if success else 1)
