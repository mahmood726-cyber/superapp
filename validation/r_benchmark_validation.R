################################################################################
# R Validation Benchmark for Living Meta-Analysis Platform
# Compares JavaScript advanced-methods.js outputs against R metafor package
#
# This script generates reference values that can be used to validate
# the JavaScript implementation against the gold-standard R packages.
#
# Required packages: metafor, meta, mada, clubSandwich, netmeta
################################################################################

# Install packages if needed
required_packages <- c("metafor", "meta", "mada", "clubSandwich", "netmeta", "jsonlite")
for (pkg in required_packages) {
  if (!requireNamespace(pkg, quietly = TRUE)) {
    install.packages(pkg, repos = "https://cloud.r-project.org")
  }
}

library(metafor)
library(meta)
library(mada)
library(clubSandwich)
library(netmeta)
library(jsonlite)

cat("=" %>% rep(70) %>% paste(collapse=""), "\n")
cat("LIVING META-ANALYSIS PLATFORM - R VALIDATION BENCHMARK\n")
cat("=" %>% rep(70) %>% paste(collapse=""), "\n\n")

# Output list for JSON export
validation_results <- list()

################################################################################
# TEST DATASET 1: BCG Vaccine (Classic meta-analysis dataset)
################################################################################

cat("\n### TEST 1: BCG Vaccine Dataset (metafor::dat.bcg) ###\n")

data(dat.bcg, package = "metafor")

# Calculate log risk ratios
dat <- escalc(measure = "RR", ai = tpos, bi = tneg, ci = cpos, di = cneg,
              data = dat.bcg, append = TRUE)

yi <- dat$yi
vi <- dat$vi

cat("\nInput data:\n")
cat("yi (log RR):", round(yi, 4), "\n")
cat("vi (variance):", round(vi, 4), "\n")

# 1.1 Heterogeneity Estimators
cat("\n--- 1.1 Heterogeneity Estimators ---\n")

tau2_methods <- c("DL", "HE", "HS", "SJ", "ML", "REML", "PM", "EB")
tau2_results <- list()

for (method in tau2_methods) {
  res <- tryCatch({
    rma(yi, vi, method = method)
  }, error = function(e) NULL)

  if (!is.null(res)) {
    tau2_results[[method]] <- list(
      tau2 = as.numeric(res$tau2),
      tau = sqrt(as.numeric(res$tau2)),
      se_tau2 = as.numeric(res$se.tau2),
      I2 = as.numeric(res$I2),
      H2 = as.numeric(res$H2),
      Q = as.numeric(res$QE),
      Q_pval = as.numeric(res$QEp)
    )
    cat(sprintf("%s: tau2=%.6f, tau=%.4f, I2=%.2f%%\n",
                method, res$tau2, sqrt(res$tau2), res$I2))
  }
}

validation_results$bcg$tau2_estimators <- tau2_results

# 1.2 Random-effects model with REML
cat("\n--- 1.2 Random-Effects Model (REML) ---\n")

res_reml <- rma(yi, vi, method = "REML")
print(summary(res_reml))

validation_results$bcg$random_effects <- list(
  estimate = as.numeric(res_reml$beta),
  se = as.numeric(res_reml$se),
  zval = as.numeric(res_reml$zval),
  pval = as.numeric(res_reml$pval),
  ci_lb = as.numeric(res_reml$ci.lb),
  ci_ub = as.numeric(res_reml$ci.ub),
  tau2 = as.numeric(res_reml$tau2),
  tau2_ci = c(
    as.numeric(confint(res_reml)$random["tau^2", "ci.lb"]),
    as.numeric(confint(res_reml)$random["tau^2", "ci.ub"])
  ),
  I2 = as.numeric(res_reml$I2),
  H2 = as.numeric(res_reml$H2)
)

cat(sprintf("\nPooled estimate: %.4f (95%% CI: %.4f to %.4f)\n",
            res_reml$beta, res_reml$ci.lb, res_reml$ci.ub))
cat(sprintf("tau2: %.4f, I2: %.1f%%\n", res_reml$tau2, res_reml$I2))

# 1.3 Tau2 Confidence Intervals (Q-profile and Profile Likelihood)
cat("\n--- 1.3 Tau2 Confidence Intervals ---\n")

tau2_ci <- confint(res_reml)
cat("Q-profile CI for tau2:\n")
print(tau2_ci$random)

validation_results$bcg$tau2_ci <- list(
  tau2_ci_lb = as.numeric(tau2_ci$random["tau^2", "ci.lb"]),
  tau2_ci_ub = as.numeric(tau2_ci$random["tau^2", "ci.ub"]),
  tau_ci_lb = as.numeric(tau2_ci$random["tau", "ci.lb"]),
  tau_ci_ub = as.numeric(tau2_ci$random["tau", "ci.ub"]),
  I2_ci_lb = as.numeric(tau2_ci$random["I^2(%)", "ci.lb"]),
  I2_ci_ub = as.numeric(tau2_ci$random["I^2(%)", "ci.ub"])
)

# 1.4 Publication Bias Tests
cat("\n--- 1.4 Publication Bias Tests ---\n")

# Egger's test
egger <- regtest(res_reml, model = "lm")
cat(sprintf("Egger's test: z=%.4f, p=%.4f\n", egger$zval, egger$pval))

# Rank correlation (Begg's test)
begg <- ranktest(res_reml)
cat(sprintf("Begg's test: tau=%.4f, p=%.4f\n", begg$tau, begg$pval))

# Trim and fill
tf <- trimfill(res_reml)
cat(sprintf("Trim & Fill: k0=%d, adjusted estimate=%.4f\n", tf$k0, tf$beta))

validation_results$bcg$pub_bias <- list(
  egger_z = as.numeric(egger$zval),
  egger_p = as.numeric(egger$pval),
  begg_tau = as.numeric(begg$tau),
  begg_p = as.numeric(begg$pval),
  trimfill_k0 = as.numeric(tf$k0),
  trimfill_estimate = as.numeric(tf$beta),
  trimfill_ci = c(as.numeric(tf$ci.lb), as.numeric(tf$ci.ub))
)

# 1.5 Hartung-Knapp Adjustment
cat("\n--- 1.5 Hartung-Knapp Adjustment ---\n")

res_hk <- rma(yi, vi, method = "REML", test = "knha")
cat(sprintf("HK-adjusted: estimate=%.4f, se=%.4f, t=%.4f, p=%.4f\n",
            res_hk$beta, res_hk$se, res_hk$zval, res_hk$pval))
cat(sprintf("95%% CI: [%.4f, %.4f]\n", res_hk$ci.lb, res_hk$ci.ub))

validation_results$bcg$hartung_knapp <- list(
  estimate = as.numeric(res_hk$beta),
  se = as.numeric(res_hk$se),
  tval = as.numeric(res_hk$zval),
  pval = as.numeric(res_hk$pval),
  ci_lb = as.numeric(res_hk$ci.lb),
  ci_ub = as.numeric(res_hk$ci.ub),
  df = as.numeric(res_hk$dfs)
)

# 1.6 Prediction Interval
cat("\n--- 1.6 Prediction Interval ---\n")

pred <- predict(res_reml, level = 0.95)
cat(sprintf("Prediction interval: [%.4f, %.4f]\n", pred$pi.lb, pred$pi.ub))

validation_results$bcg$prediction_interval <- list(
  pi_lb = as.numeric(pred$pi.lb),
  pi_ub = as.numeric(pred$pi.ub)
)

################################################################################
# TEST DATASET 2: Standardized Mean Differences (for different effect size)
################################################################################

cat("\n\n### TEST 2: Standardized Mean Differences ###\n")

# Create SMD dataset
set.seed(12345)
k <- 15
n1 <- round(runif(k, 20, 100))
n2 <- round(runif(k, 20, 100))
d_true <- 0.5
tau_true <- 0.3
d_i <- rnorm(k, d_true, tau_true)
se_i <- sqrt(1/n1 + 1/n2 + d_i^2/(2*(n1+n2)))

yi_smd <- d_i + rnorm(k, 0, se_i)
vi_smd <- se_i^2

cat("SMD data (simulated):\n")
cat("yi:", round(yi_smd, 4), "\n")
cat("vi:", round(vi_smd, 4), "\n")

validation_results$smd <- list(
  yi = yi_smd,
  vi = vi_smd
)

# All tau2 estimators
cat("\n--- Tau2 Estimators for SMD data ---\n")
tau2_smd <- list()
for (method in tau2_methods) {
  res <- tryCatch({
    rma(yi_smd, vi_smd, method = method)
  }, error = function(e) NULL)

  if (!is.null(res)) {
    tau2_smd[[method]] <- list(
      tau2 = as.numeric(res$tau2),
      estimate = as.numeric(res$beta),
      se = as.numeric(res$se)
    )
    cat(sprintf("%s: tau2=%.6f, estimate=%.4f\n", method, res$tau2, res$beta))
  }
}
validation_results$smd$tau2_estimators <- tau2_smd

################################################################################
# TEST DATASET 3: Selection Model Validation
################################################################################

cat("\n\n### TEST 3: Selection Models ###\n")

# Use BCG data for selection models
res_sel <- rma(yi, vi, method = "REML")

# Copas selection model (if available)
cat("\n--- Selection Model Analysis ---\n")

# PET-PEESE
pet <- lm(yi ~ I(sqrt(vi)), weights = 1/vi)
peese <- lm(yi ~ vi, weights = 1/vi)

cat(sprintf("PET intercept: %.4f (p=%.4f)\n", coef(pet)[1], summary(pet)$coef[1,4]))
cat(sprintf("PEESE intercept: %.4f (p=%.4f)\n", coef(peese)[1], summary(peese)$coef[1,4]))

validation_results$bcg$pet_peese <- list(
  pet_intercept = as.numeric(coef(pet)[1]),
  pet_slope = as.numeric(coef(pet)[2]),
  pet_pval = as.numeric(summary(pet)$coef[1,4]),
  peese_intercept = as.numeric(coef(peese)[1]),
  peese_slope = as.numeric(coef(peese)[2]),
  peese_pval = as.numeric(summary(peese)$coef[1,4])
)

################################################################################
# TEST DATASET 4: Robust Variance Estimation (Clustered Data)
################################################################################

cat("\n\n### TEST 4: Robust Variance Estimation ###\n")

# Create clustered data (multiple outcomes per study)
set.seed(54321)
n_studies <- 10
n_effects_per_study <- sample(2:5, n_studies, replace = TRUE)
cluster_ids <- rep(1:n_studies, n_effects_per_study)
n_total <- sum(n_effects_per_study)

yi_rve <- rnorm(n_total, 0.3, 0.2) + rnorm(n_studies, 0, 0.15)[cluster_ids]
vi_rve <- runif(n_total, 0.01, 0.1)

cat(sprintf("Clustered data: %d effects in %d studies\n", n_total, n_studies))

# Fit model and get RVE standard errors
res_rve <- rma.mv(yi_rve, vi_rve, random = ~ 1 | cluster_ids)

# clubSandwich RVE
rve_cr0 <- coef_test(res_rve, vcov = "CR0", cluster = cluster_ids)
rve_cr1 <- coef_test(res_rve, vcov = "CR1", cluster = cluster_ids)
rve_cr2 <- coef_test(res_rve, vcov = "CR2", cluster = cluster_ids)

cat(sprintf("CR0: SE=%.4f\n", rve_cr0$SE))
cat(sprintf("CR1: SE=%.4f\n", rve_cr1$SE))
cat(sprintf("CR2: SE=%.4f, df=%.2f\n", rve_cr2$SE, rve_cr2$df))

validation_results$rve <- list(
  yi = yi_rve,
  vi = vi_rve,
  clusters = cluster_ids,
  estimate = as.numeric(res_rve$beta),
  cr0_se = as.numeric(rve_cr0$SE),
  cr1_se = as.numeric(rve_cr1$SE),
  cr2_se = as.numeric(rve_cr2$SE),
  cr2_df = as.numeric(rve_cr2$df)
)

################################################################################
# TEST DATASET 5: Network Meta-Analysis
################################################################################

cat("\n\n### TEST 5: Network Meta-Analysis ###\n")

# Create NMA dataset
nma_data <- data.frame(
  study = c(1,1,2,2,3,3,4,4,5,5,5,6,6,7,7,8,8),
  treat = c("A","B","A","C","B","C","A","B","A","B","C","A","C","B","C","A","B"),
  n = c(50,52,48,51,55,53,60,58,45,47,44,62,59,51,49,57,55),
  events = c(12,8,15,10,18,12,20,14,10,7,8,22,15,14,10,16,11)
)

# Calculate log odds ratios for each study
nma_contrasts <- data.frame()
for (s in unique(nma_data$study)) {
  study_data <- nma_data[nma_data$study == s, ]
  treats <- study_data$treat

  for (i in 1:(nrow(study_data)-1)) {
    for (j in (i+1):nrow(study_data)) {
      t1 <- study_data[i, ]
      t2 <- study_data[j, ]

      # Log OR and SE
      lor <- log((t1$events / (t1$n - t1$events)) / (t2$events / (t2$n - t2$events)))
      se_lor <- sqrt(1/t1$events + 1/(t1$n-t1$events) + 1/t2$events + 1/(t2$n-t2$events))

      nma_contrasts <- rbind(nma_contrasts, data.frame(
        study = s,
        treat1 = as.character(t1$treat),
        treat2 = as.character(t2$treat),
        TE = lor,
        seTE = se_lor
      ))
    }
  }
}

cat("NMA contrasts:\n")
print(nma_contrasts)

# Fit network meta-analysis
nma_fit <- tryCatch({
  netmeta(TE, seTE, treat1, treat2, study, data = nma_contrasts,
          reference.group = "A", sm = "OR")
}, error = function(e) {
  cat("netmeta error:", e$message, "\n")
  NULL
})

if (!is.null(nma_fit)) {
  cat("\n--- NMA Results ---\n")
  print(nma_fit)

  # League table
  cat("\nLeague table (vs A):\n")
  lt <- netleague(nma_fit)
  print(lt$random)

  # Rankings
  cat("\nP-scores:\n")
  print(netrank(nma_fit))

  validation_results$nma <- list(
    contrasts = nma_contrasts,
    treatments = nma_fit$trts,
    effects_vs_A = as.numeric(nma_fit$TE.random[, "A"]),
    se_vs_A = as.numeric(nma_fit$seTE.random[, "A"]),
    tau2 = as.numeric(nma_fit$tau2),
    Q_total = as.numeric(nma_fit$Q),
    Q_heterogeneity = as.numeric(nma_fit$Q.heterogeneity),
    Q_inconsistency = as.numeric(nma_fit$Q.inconsistency),
    p_scores = as.numeric(netrank(nma_fit)$Pscore.random)
  )
}

################################################################################
# TEST DATASET 6: Diagnostic Test Accuracy (DTA)
################################################################################

cat("\n\n### TEST 6: Diagnostic Test Accuracy ###\n")

# Use mada package example data
data(Dementia, package = "mada")

cat("DTA data (Dementia dataset):\n")
print(head(Dementia))

# Bivariate model (Reitsma)
dta_bivariate <- reitsma(Dementia)
cat("\n--- Bivariate Model (Reitsma) ---\n")
print(summary(dta_bivariate))

validation_results$dta <- list(
  tp = Dementia$TP,
  fp = Dementia$FP,
  fn = Dementia$FN,
  tn = Dementia$TN,
  bivariate = list(
    mu_sens = as.numeric(coef(dta_bivariate)["tsens"]),
    mu_spec = as.numeric(coef(dta_bivariate)["tfpr"]),
    pooled_sens = as.numeric(summary(dta_bivariate)$coefficients["sens", "Est."]),
    pooled_spec = as.numeric(summary(dta_bivariate)$coefficients["spec", "Est."]),
    auc = as.numeric(AUC(dta_bivariate))
  )
)

cat(sprintf("\nPooled Sensitivity: %.4f\n", summary(dta_bivariate)$coefficients["sens", "Est."]))
cat(sprintf("Pooled Specificity: %.4f\n", summary(dta_bivariate)$coefficients["spec", "Est."]))
cat(sprintf("AUC: %.4f\n", AUC(dta_bivariate)))

################################################################################
# TEST DATASET 7: Meta-Regression
################################################################################

cat("\n\n### TEST 7: Meta-Regression ###\n")

# BCG data with latitude as moderator
res_metareg <- rma(yi, vi, mods = ~ ablat, data = dat, method = "REML")

cat("Meta-regression with absolute latitude:\n")
print(summary(res_metareg))

validation_results$bcg$meta_regression <- list(
  intercept = as.numeric(res_metareg$beta[1]),
  slope = as.numeric(res_metareg$beta[2]),
  intercept_se = as.numeric(res_metareg$se[1]),
  slope_se = as.numeric(res_metareg$se[2]),
  intercept_pval = as.numeric(res_metareg$pval[1]),
  slope_pval = as.numeric(res_metareg$pval[2]),
  tau2 = as.numeric(res_metareg$tau2),
  R2 = as.numeric(res_metareg$R2),
  QM = as.numeric(res_metareg$QM),
  QM_pval = as.numeric(res_metareg$QMp)
)

################################################################################
# TEST DATASET 8: Leave-One-Out Analysis
################################################################################

cat("\n\n### TEST 8: Leave-One-Out Analysis ###\n")

loo <- leave1out(res_reml)
cat("Leave-one-out analysis:\n")
print(loo)

validation_results$bcg$leave_one_out <- list(
  estimates = as.numeric(loo$estimate),
  se = as.numeric(loo$se),
  tau2 = as.numeric(loo$tau2),
  I2 = as.numeric(loo$I2)
)

################################################################################
# TEST DATASET 9: Cumulative Meta-Analysis
################################################################################

cat("\n\n### TEST 9: Cumulative Meta-Analysis ###\n")

# Order by year
dat_ordered <- dat[order(dat$year), ]
res_ordered <- rma(yi, vi, data = dat_ordered, method = "REML")
cum <- cumul(res_ordered)

cat("Cumulative meta-analysis (by year):\n")
print(cum)

validation_results$bcg$cumulative <- list(
  years = dat_ordered$year,
  estimates = as.numeric(cum$estimate),
  se = as.numeric(cum$se),
  ci_lb = as.numeric(cum$ci.lb),
  ci_ub = as.numeric(cum$ci.ub)
)

################################################################################
# EXPORT VALIDATION DATA
################################################################################

cat("\n\n### EXPORTING VALIDATION DATA ###\n")

# Export to JSON
json_output <- toJSON(validation_results, pretty = TRUE, auto_unbox = TRUE)
writeLines(json_output, "validation_reference_data.json")

cat("Validation data exported to: validation_reference_data.json\n")

# Also create JavaScript test file
js_test <- sprintf('
/**
 * R Validation Reference Data
 * Generated: %s
 * Use these values to validate JavaScript implementations
 */

export const R_VALIDATION_DATA = %s;

// Quick validation function
export function validateAgainstR(jsResult, rReference, tolerance = 0.0001) {
  const errors = [];

  function compare(js, r, path) {
    if (typeof r === "number") {
      if (Math.abs(js - r) > tolerance) {
        errors.push(`${path}: JS=${js}, R=${r}, diff=${Math.abs(js-r)}`);
      }
    } else if (Array.isArray(r)) {
      r.forEach((v, i) => compare(js[i], v, `${path}[${i}]`));
    } else if (typeof r === "object" && r !== null) {
      Object.keys(r).forEach(k => compare(js[k], r[k], `${path}.${k}`));
    }
  }

  compare(jsResult, rReference, "root");
  return { passed: errors.length === 0, errors };
}

// Example usage:
// import { R_VALIDATION_DATA, validateAgainstR } from "./r_validation_reference.js";
// const result = estimateTau2(yi, vi, "REML");
// const validation = validateAgainstR(result, R_VALIDATION_DATA.bcg.tau2_estimators.REML);
// console.log(validation.passed ? "PASS" : "FAIL", validation.errors);
', Sys.time(), json_output)

writeLines(js_test, "r_validation_reference.js")
cat("JavaScript reference file exported to: r_validation_reference.js\n")

################################################################################
# SUMMARY TABLE
################################################################################

cat("\n\n")
cat("=" %>% rep(70) %>% paste(collapse=""), "\n")
cat("VALIDATION SUMMARY\n")
cat("=" %>% rep(70) %>% paste(collapse=""), "\n")

cat("\nKey Reference Values for JavaScript Validation:\n")
cat("-" %>% rep(50) %>% paste(collapse=""), "\n")

cat("\n1. BCG Data - Random Effects (REML):\n")
cat(sprintf("   Pooled estimate: %.6f\n", res_reml$beta))
cat(sprintf("   SE: %.6f\n", res_reml$se))
cat(sprintf("   tau2: %.6f\n", res_reml$tau2))
cat(sprintf("   I2: %.2f%%\n", res_reml$I2))

cat("\n2. BCG Data - Tau2 CI (Q-profile):\n")
cat(sprintf("   tau2 CI: [%.6f, %.6f]\n",
            tau2_ci$random["tau^2", "ci.lb"],
            tau2_ci$random["tau^2", "ci.ub"]))

cat("\n3. BCG Data - Hartung-Knapp:\n")
cat(sprintf("   SE: %.6f\n", res_hk$se))
cat(sprintf("   df: %.1f\n", res_hk$dfs))

cat("\n4. DTA - Bivariate Model:\n")
cat(sprintf("   Pooled Sensitivity: %.4f\n", summary(dta_bivariate)$coefficients["sens", "Est."]))
cat(sprintf("   Pooled Specificity: %.4f\n", summary(dta_bivariate)$coefficients["spec", "Est."]))

cat("\n")
cat("=" %>% rep(70) %>% paste(collapse=""), "\n")
cat("VALIDATION COMPLETE\n")
cat("=" %>% rep(70) %>% paste(collapse=""), "\n")
