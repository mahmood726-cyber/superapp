# DTA Meta-Analysis Validation against mada::reitsma()
#
# This script validates the JavaScript bivariateDTA implementation
# against the gold standard mada package (Reitsma et al. model)

suppressPackageStartupMessages({
  if (!require(mada, quietly = TRUE)) {
    install.packages("mada", repos = "https://cloud.r-project.org")
    library(mada)
  }
  library(jsonlite)
})

cat("=== DTA Validation: JavaScript vs mada::reitsma() ===\n\n")

fixtures_dir <- "fixtures"
if (!dir.exists(fixtures_dir)) {
  dir.create(fixtures_dir)
}

# ============================================================================
# Test Dataset 1: Deeks' Example (Antibody tests for TB)
# ============================================================================

cat("=== Dataset 1: Simulated DTA data (10 studies) ===\n")

# Generate realistic DTA data
set.seed(42)
k <- 10

# Generate study-level parameters from bivariate normal
mu_sens <- 2.5  # logit(0.92)
mu_spec <- 2.0  # logit(0.88)
sigma2_sens <- 0.3
sigma2_spec <- 0.2
rho <- -0.4

# Generate random effects
Sigma <- matrix(c(sigma2_sens, rho * sqrt(sigma2_sens * sigma2_spec),
                  rho * sqrt(sigma2_sens * sigma2_spec), sigma2_spec), 2, 2)

L <- chol(Sigma)
u <- matrix(rnorm(k * 2), nrow = k) %*% L
logit_sens <- mu_sens + u[, 1]
logit_spec <- mu_spec + u[, 2]

sens <- plogis(logit_sens)
spec <- plogis(logit_spec)

# Generate counts (varying sample sizes)
n_diseased <- sample(50:150, k, replace = TRUE)
n_healthy <- sample(100:300, k, replace = TRUE)

tp <- rbinom(k, n_diseased, sens)
fn <- n_diseased - tp
tn <- rbinom(k, n_healthy, spec)
fp <- n_healthy - tn

dta_data1 <- list(
  description = "Simulated DTA data (10 studies)",
  tp = tp, fp = fp, fn = fn, tn = tn,
  k = k,
  true_params = list(
    mu_sens = mu_sens, mu_spec = mu_spec,
    sigma2_sens = sigma2_sens, sigma2_spec = sigma2_spec,
    rho = rho
  )
)

# Fit reitsma model
fit1 <- reitsma(data.frame(TP = tp, FP = fp, FN = fn, TN = tn))
summ1 <- summary(fit1)

# Extract parameters properly from mada model
# The coefficients are stored in fit1$coefficients with names like "tsens.(Intercept)"
logit_sens_est <- as.numeric(fit1$coefficients[1])  # tsens.(Intercept)
logit_fpr_est <- as.numeric(fit1$coefficients[2])   # tfpr.(Intercept) = logit(FPR)

dta_data1$reitsma <- list(
  sensitivity = list(
    estimate = plogis(logit_sens_est),
    logit = logit_sens_est,
    logitSE = as.numeric(sqrt(fit1$vcov[1, 1]))
  ),
  specificity = list(
    estimate = 1 - plogis(logit_fpr_est),  # spec = 1 - FPR
    logit = -logit_fpr_est,  # logit(spec) = -logit(FPR)
    logitSE = as.numeric(sqrt(fit1$vcov[2, 2]))
  ),
  Psi = list(
    sigma2_sens = as.numeric(fit1$Psi[1, 1]),
    sigma2_spec = as.numeric(fit1$Psi[2, 2]),
    correlation = as.numeric(fit1$Psi[1, 2] / sqrt(fit1$Psi[1, 1] * fit1$Psi[2, 2]))
  ),
  AUC = as.numeric(AUC(fit1)$AUC)
)

cat("Sensitivity (R):", dta_data1$reitsma$sensitivity$estimate, "\n")
cat("Specificity (R):", dta_data1$reitsma$specificity$estimate, "\n")
cat("Correlation (R):", dta_data1$reitsma$Psi$correlation, "\n")
cat("AUC (R):", dta_data1$reitsma$AUC, "\n\n")

write_json(dta_data1, file.path(fixtures_dir, "dta_simulated.json"),
           pretty = TRUE, auto_unbox = TRUE)

# ============================================================================
# Test Dataset 2: Dementia screening (real mada dataset)
# ============================================================================

cat("=== Dataset 2: Dementia screening (mada package) ===\n")

data(Dementia)
dm <- Dementia

dta_data2 <- list(
  description = "Dementia screening meta-analysis (mada package)",
  tp = as.integer(dm$TP),
  fp = as.integer(dm$FP),
  fn = as.integer(dm$FN),
  tn = as.integer(dm$TN),
  k = nrow(dm)
)

# Fit reitsma model
fit2 <- reitsma(dm)
summ2 <- summary(fit2)

logit_sens_est2 <- as.numeric(fit2$coefficients[1])
logit_fpr_est2 <- as.numeric(fit2$coefficients[2])

dta_data2$reitsma <- list(
  sensitivity = list(
    estimate = plogis(logit_sens_est2),
    logit = logit_sens_est2,
    logitSE = as.numeric(sqrt(fit2$vcov[1, 1]))
  ),
  specificity = list(
    estimate = 1 - plogis(logit_fpr_est2),
    logit = -logit_fpr_est2,
    logitSE = as.numeric(sqrt(fit2$vcov[2, 2]))
  ),
  Psi = list(
    sigma2_sens = as.numeric(fit2$Psi[1, 1]),
    sigma2_spec = as.numeric(fit2$Psi[2, 2]),
    correlation = as.numeric(fit2$Psi[1, 2] / sqrt(fit2$Psi[1, 1] * fit2$Psi[2, 2]))
  ),
  AUC = as.numeric(AUC(fit2)$AUC)
)

cat("Sensitivity (R):", dta_data2$reitsma$sensitivity$estimate, "\n")
cat("Specificity (R):", dta_data2$reitsma$specificity$estimate, "\n")
cat("Correlation (R):", dta_data2$reitsma$Psi$correlation, "\n")
cat("AUC (R):", dta_data2$reitsma$AUC, "\n\n")

write_json(dta_data2, file.path(fixtures_dir, "dta_dementia.json"),
           pretty = TRUE, auto_unbox = TRUE)

# ============================================================================
# Test Dataset 3: Small study example (3 studies - edge case)
# ============================================================================

cat("=== Dataset 3: Small example (3 studies) ===\n")

tp3 <- c(50, 48, 45)
fp3 <- c(10, 12, 8)
fn3 <- c(5, 7, 10)
tn3 <- c(90, 88, 92)

dta_data3 <- list(
  description = "Small DTA meta-analysis (3 studies)",
  tp = tp3, fp = fp3, fn = fn3, tn = tn3,
  k = 3
)

# Fit reitsma model (may be unstable with k=3)
tryCatch({
  fit3 <- reitsma(data.frame(TP = tp3, FP = fp3, FN = fn3, TN = tn3))
  logit_sens_est3 <- as.numeric(fit3$coefficients[1])
  logit_fpr_est3 <- as.numeric(fit3$coefficients[2])
  dta_data3$reitsma <- list(
    sensitivity = list(
      estimate = plogis(logit_sens_est3),
      logit = logit_sens_est3
    ),
    specificity = list(
      estimate = 1 - plogis(logit_fpr_est3),
      logit = -logit_fpr_est3
    ),
    Psi = list(
      sigma2_sens = as.numeric(fit3$Psi[1, 1]),
      sigma2_spec = as.numeric(fit3$Psi[2, 2]),
      correlation = as.numeric(fit3$Psi[1, 2] / sqrt(fit3$Psi[1, 1] * fit3$Psi[2, 2]))
    )
  )
  cat("Sensitivity (R):", dta_data3$reitsma$sensitivity$estimate, "\n")
  cat("Specificity (R):", dta_data3$reitsma$specificity$estimate, "\n")
  cat("Correlation (R):", dta_data3$reitsma$Psi$correlation, "\n\n")
}, error = function(e) {
  cat("Note: reitsma() failed for k=3 (expected for very small k):", e$message, "\n\n")
  dta_data3$reitsma <- list(error = e$message)
})

write_json(dta_data3, file.path(fixtures_dir, "dta_small.json"),
           pretty = TRUE, auto_unbox = TRUE)

# ============================================================================
# Test Dataset 4: High heterogeneity
# ============================================================================

cat("=== Dataset 4: High heterogeneity example ===\n")

set.seed(123)
k4 <- 15

# High variance parameters
mu_sens4 <- 1.5
mu_spec4 <- 1.8
sigma2_sens4 <- 1.0  # High heterogeneity
sigma2_spec4 <- 0.8
rho4 <- -0.6

Sigma4 <- matrix(c(sigma2_sens4, rho4 * sqrt(sigma2_sens4 * sigma2_spec4),
                   rho4 * sqrt(sigma2_sens4 * sigma2_spec4), sigma2_spec4), 2, 2)
L4 <- chol(Sigma4)
u4 <- matrix(rnorm(k4 * 2), nrow = k4) %*% L4
logit_sens4 <- mu_sens4 + u4[, 1]
logit_spec4 <- mu_spec4 + u4[, 2]

sens4 <- plogis(logit_sens4)
spec4 <- plogis(logit_spec4)

n_diseased4 <- sample(30:100, k4, replace = TRUE)
n_healthy4 <- sample(50:200, k4, replace = TRUE)

tp4 <- rbinom(k4, n_diseased4, sens4)
fn4 <- n_diseased4 - tp4
tn4 <- rbinom(k4, n_healthy4, spec4)
fp4 <- n_healthy4 - tn4

dta_data4 <- list(
  description = "High heterogeneity DTA (15 studies)",
  tp = as.integer(tp4), fp = as.integer(fp4),
  fn = as.integer(fn4), tn = as.integer(tn4),
  k = k4,
  true_params = list(
    mu_sens = mu_sens4, mu_spec = mu_spec4,
    sigma2_sens = sigma2_sens4, sigma2_spec = sigma2_spec4,
    rho = rho4
  )
)

fit4 <- reitsma(data.frame(TP = tp4, FP = fp4, FN = fn4, TN = tn4))

logit_sens_est4 <- as.numeric(fit4$coefficients[1])
logit_fpr_est4 <- as.numeric(fit4$coefficients[2])

dta_data4$reitsma <- list(
  sensitivity = list(
    estimate = plogis(logit_sens_est4),
    logit = logit_sens_est4,
    logitSE = as.numeric(sqrt(fit4$vcov[1, 1]))
  ),
  specificity = list(
    estimate = 1 - plogis(logit_fpr_est4),
    logit = -logit_fpr_est4,
    logitSE = as.numeric(sqrt(fit4$vcov[2, 2]))
  ),
  Psi = list(
    sigma2_sens = as.numeric(fit4$Psi[1, 1]),
    sigma2_spec = as.numeric(fit4$Psi[2, 2]),
    correlation = as.numeric(fit4$Psi[1, 2] / sqrt(fit4$Psi[1, 1] * fit4$Psi[2, 2]))
  ),
  AUC = as.numeric(AUC(fit4)$AUC)
)

cat("Sensitivity (R):", dta_data4$reitsma$sensitivity$estimate, "\n")
cat("Specificity (R):", dta_data4$reitsma$specificity$estimate, "\n")
cat("Correlation (R):", dta_data4$reitsma$Psi$correlation, "\n")
cat("AUC (R):", dta_data4$reitsma$AUC, "\n\n")

write_json(dta_data4, file.path(fixtures_dir, "dta_high_het.json"),
           pretty = TRUE, auto_unbox = TRUE)

# ============================================================================
# Test Dataset 5: Zero cells (requires continuity correction)
# ============================================================================

cat("=== Dataset 5: Zero cells example ===\n")

tp5 <- c(50, 0, 48, 45)  # One study has TP=0
fp5 <- c(5, 8, 6, 4)
fn5 <- c(5, 50, 7, 10)
tn5 <- c(95, 92, 94, 96)

dta_data5 <- list(
  description = "DTA with zero cells (4 studies)",
  tp = tp5, fp = fp5, fn = fn5, tn = tn5,
  k = 4,
  note = "Study 2 has TP=0 (requires continuity correction)"
)

# Fit with continuity correction
tryCatch({
  fit5 <- reitsma(data.frame(TP = tp5, FP = fp5, FN = fn5, TN = tn5),
                  correction = 0.5, correction.control = "all")
  logit_sens_est5 <- as.numeric(fit5$coefficients[1])
  logit_fpr_est5 <- as.numeric(fit5$coefficients[2])
  dta_data5$reitsma <- list(
    sensitivity = list(
      estimate = plogis(logit_sens_est5),
      logit = logit_sens_est5
    ),
    specificity = list(
      estimate = 1 - plogis(logit_fpr_est5),
      logit = -logit_fpr_est5
    ),
    Psi = list(
      sigma2_sens = as.numeric(fit5$Psi[1, 1]),
      sigma2_spec = as.numeric(fit5$Psi[2, 2]),
      correlation = as.numeric(fit5$Psi[1, 2] / sqrt(fit5$Psi[1, 1] * fit5$Psi[2, 2]))
    )
  )
  cat("Sensitivity (R):", dta_data5$reitsma$sensitivity$estimate, "\n")
  cat("Specificity (R):", dta_data5$reitsma$specificity$estimate, "\n\n")
}, error = function(e) {
  cat("Note: reitsma() with zero cells:", e$message, "\n\n")
  dta_data5$reitsma <- list(error = e$message)
})

write_json(dta_data5, file.path(fixtures_dir, "dta_zero_cells.json"),
           pretty = TRUE, auto_unbox = TRUE)

# ============================================================================
# Summary
# ============================================================================

cat("=== Summary ===\n")
cat("Generated DTA fixtures:\n")
cat("  - dta_simulated.json (10 studies, known true params)\n")
cat("  - dta_dementia.json (mada package Dementia dataset)\n")
cat("  - dta_small.json (3 studies, edge case)\n")
cat("  - dta_high_het.json (15 studies, high heterogeneity)\n")
cat("  - dta_zero_cells.json (4 studies with zero cells)\n")
cat("\nAll fixtures use mada::reitsma() as reference.\n")

# ============================================================================
# Tolerances for JavaScript validation
# ============================================================================

cat("\n=== Recommended Tolerances ===\n")
cat("Point estimates (sens, spec): 0.01 (1% absolute difference)\n")
cat("Variance components: 0.05 (5% relative difference)\n")
cat("Correlation: 0.1 (bivariate models are sensitive)\n")
cat("AUC: 0.02 (2% absolute difference)\n")
