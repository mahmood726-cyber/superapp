# Comprehensive R Validation for Meta-Analysis Superapp
# Generates reference values for comparison with JavaScript implementation

suppressPackageStartupMessages({
  library(metafor)
  library(jsonlite)
})

cat("=" , rep("=", 68), "\n", sep="")
cat("META-ANALYSIS SUPERAPP - R VALIDATION BENCHMARKS\n")
cat("=" , rep("=", 68), "\n\n", sep="")

# =============================================================================
# Test Data
# =============================================================================

set.seed(42)
k <- 10
yi <- c(0.5, 0.3, 0.7, 0.4, 0.6, 0.2, 0.8, 0.35, 0.55, 0.45)
vi <- c(0.04, 0.05, 0.03, 0.06, 0.04, 0.05, 0.04, 0.05, 0.04, 0.05)

# =============================================================================
# 1. TAU² ESTIMATORS
# =============================================================================

cat("=== TAU² ESTIMATORS ===\n\n")

methods <- c("DL", "REML", "ML", "PM", "SJ", "HE", "EB", "HS")

tau2_results <- list()
for (m in methods) {
  fit <- tryCatch({
    rma(yi, vi, method = m)
  }, error = function(e) NULL)

  if (!is.null(fit)) {
    tau2_results[[m]] <- list(
      tau2 = as.numeric(fit$tau2),
      se_tau2 = as.numeric(fit$se.tau2),
      I2 = as.numeric(fit$I2),
      H2 = as.numeric(fit$H2)
    )
    cat(sprintf("%-4s: τ² = %.6f, I² = %.2f%%\n", m, fit$tau2, fit$I2))
  }
}

# =============================================================================
# 2. POOLED ESTIMATES (Random Effects)
# =============================================================================

cat("\n=== RANDOM EFFECTS META-ANALYSIS ===\n\n")

fit_re <- rma(yi, vi, method = "REML")
cat(sprintf("Pooled Effect: %.4f (SE: %.4f)\n", fit_re$beta, fit_re$se))
cat(sprintf("95%% CI: [%.4f, %.4f]\n", fit_re$ci.lb, fit_re$ci.ub))
cat(sprintf("z = %.4f, p = %.6f\n", fit_re$zval, fit_re$pval))
cat(sprintf("Q = %.4f, df = %d, p = %.6f\n", fit_re$QE, fit_re$k - 1, fit_re$QEp))

# =============================================================================
# 3. PUBLICATION BIAS TESTS
# =============================================================================

cat("\n=== PUBLICATION BIAS ===\n\n")

# Egger's test
egger <- regtest(fit_re, model = "lm")
cat(sprintf("Egger's Test: intercept = %.4f, p = %.4f\n",
            coef(summary(egger$fit))[1, 1], egger$pval))

# Trim and fill
tf <- trimfill(fit_re)
cat(sprintf("Trim-and-Fill: k0 = %d, adjusted effect = %.4f\n",
            tf$k0, as.numeric(tf$beta)))

# Fail-safe N
fs <- fsn(yi, vi, type = "Rosenthal")
cat(sprintf("Fail-safe N (Rosenthal): %d\n", fs$fsnum))

# =============================================================================
# 4. LEAVE-ONE-OUT SENSITIVITY
# =============================================================================

cat("\n=== LEAVE-ONE-OUT ANALYSIS ===\n\n")

loo <- leave1out(fit_re)
cat("Study  | Effect  | τ²      | I²\n")
cat("-------|---------|---------|--------\n")
for (i in 1:k) {
  cat(sprintf("%6d | %.4f  | %.4f  | %.2f%%\n",
              i, loo$estimate[i], loo$tau2[i], loo$I2[i]))
}

# =============================================================================
# 5. CUMULATIVE META-ANALYSIS
# =============================================================================

cat("\n=== CUMULATIVE META-ANALYSIS ===\n\n")

cumul <- cumul(fit_re)
cat("Study | Cumul Effect | 95% CI\n")
cat("------|--------------|------------------\n")
for (i in 1:k) {
  cat(sprintf("%5d | %.4f       | [%.4f, %.4f]\n",
              i, cumul$estimate[i], cumul$ci.lb[i], cumul$ci.ub[i]))
}

# =============================================================================
# 6. META-REGRESSION
# =============================================================================

cat("\n=== META-REGRESSION ===\n\n")

# Create moderator
year <- 2010:2019
fit_mr <- rma(yi, vi, mods = ~ year, method = "REML")

cat(sprintf("Intercept: %.4f (SE: %.4f), p = %.4f\n",
            fit_mr$beta[1], fit_mr$se[1], fit_mr$pval[1]))
cat(sprintf("Year coef: %.6f (SE: %.6f), p = %.4f\n",
            fit_mr$beta[2], fit_mr$se[2], fit_mr$pval[2]))
cat(sprintf("R² = %.2f%%\n", fit_mr$R2))
cat(sprintf("QM = %.4f, df = %d, p = %.4f\n", fit_mr$QM, fit_mr$m, fit_mr$QMp))

# =============================================================================
# 7. THREE-LEVEL META-ANALYSIS
# =============================================================================

cat("\n=== THREE-LEVEL META-ANALYSIS ===\n\n")

# Create cluster structure
cluster <- rep(1:5, each = 2)

tryCatch({
  fit_3l <- rma.mv(yi, vi, random = ~ 1 | cluster/1:k, data = data.frame(yi, vi, cluster))
  cat(sprintf("Pooled Effect: %.4f (SE: %.4f)\n", fit_3l$beta, fit_3l$se))
  cat(sprintf("σ²₂ (between-cluster): %.6f\n", fit_3l$sigma2[1]))
  cat(sprintf("σ²₃ (within-cluster): %.6f\n", fit_3l$sigma2[2]))
}, error = function(e) {
  cat("Three-level model failed:", e$message, "\n")
})

# =============================================================================
# 8. KNAPP-HARTUNG ADJUSTMENT
# =============================================================================

cat("\n=== KNAPP-HARTUNG ADJUSTMENT ===\n\n")

fit_kh <- rma(yi, vi, method = "REML", test = "knha")
cat(sprintf("With KH: SE = %.4f, 95%% CI = [%.4f, %.4f]\n",
            fit_kh$se, fit_kh$ci.lb, fit_kh$ci.ub))
cat(sprintf("Without KH: SE = %.4f, 95%% CI = [%.4f, %.4f]\n",
            fit_re$se, fit_re$ci.lb, fit_re$ci.ub))

# =============================================================================
# SUMMARY
# =============================================================================

cat("\n", rep("=", 70), "\n", sep="")
cat("VALIDATION REFERENCE VALUES (use for JavaScript comparison)\n")
cat(rep("=", 70), "\n\n", sep="")

reference <- list(
  data = list(yi = yi, vi = vi),
  tau2 = tau2_results,
  pooled = list(
    effect = as.numeric(fit_re$beta),
    se = as.numeric(fit_re$se),
    ci_lb = as.numeric(fit_re$ci.lb),
    ci_ub = as.numeric(fit_re$ci.ub),
    z = as.numeric(fit_re$zval),
    p = as.numeric(fit_re$pval),
    tau2 = as.numeric(fit_re$tau2),
    I2 = as.numeric(fit_re$I2)
  ),
  egger = list(
    intercept = as.numeric(coef(summary(egger$fit))[1, 1]),
    pvalue = as.numeric(egger$pval)
  ),
  trim_fill = list(
    k0 = as.numeric(tf$k0),
    adjusted = as.numeric(tf$beta)
  ),
  meta_regression = list(
    intercept = as.numeric(fit_mr$beta[1]),
    slope = as.numeric(fit_mr$beta[2]),
    R2 = as.numeric(fit_mr$R2)
  )
)

# Save to JSON
json_file <- "fixtures/pairwise_reference.json"
write_json(reference, json_file, pretty = TRUE, auto_unbox = TRUE)
cat("Reference values saved to:", json_file, "\n")

cat("\n✓ Validation complete!\n")
