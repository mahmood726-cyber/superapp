# Generate R reference fixtures for JavaScript validation
#
# This script generates JSON fixtures containing expected values from R packages
# for validating the JavaScript implementation of meta-analysis methods.

suppressPackageStartupMessages({
  library(metafor)
  library(jsonlite)
})

cat("Generating R reference fixtures for meta-analysis validation...\n\n")

fixtures_dir <- "fixtures"
if (!dir.exists(fixtures_dir)) {
  dir.create(fixtures_dir)
}

# ============================================================================
# BCG Vaccine Data (Classic Meta-Analysis Dataset)
# ============================================================================

cat("=== BCG Vaccine Data ===\n")

# Log Risk Ratios and variances
yi <- c(-0.8893, -1.5854, -1.3481, -1.4416, -0.2175, -0.7861, -1.6209, 0.0120,
        -0.4717, -1.4012, -0.3408, 0.4459, -0.0173)
vi <- c(0.0379, 0.0188, 0.0116, 0.0144, 0.0204, 0.0342, 0.0399, 0.0537,
        0.0731, 0.0072, 0.0138, 0.0177, 0.0283)

bcg_fixture <- list(
  description = "BCG vaccine meta-analysis (13 studies)",
  yi = yi,
  vi = vi,
  k = length(yi)
)

# Fixed-effects model
fe <- rma(yi, vi, method = "FE")
bcg_fixture$fixed_effects <- list(
  estimate = as.numeric(fe$beta),
  se = as.numeric(fe$se),
  ci_lower = as.numeric(fe$ci.lb),
  ci_upper = as.numeric(fe$ci.ub),
  z = as.numeric(fe$zval),
  p = as.numeric(fe$pval),
  Q = as.numeric(fe$QE),
  Q_df = as.numeric(fe$k - 1),
  Q_pval = as.numeric(fe$QEp)
)

cat("Fixed-effects estimate:", bcg_fixture$fixed_effects$estimate, "\n")

# DerSimonian-Laird
dl <- rma(yi, vi, method = "DL")
bcg_fixture$DL <- list(
  estimate = as.numeric(dl$beta),
  se = as.numeric(dl$se),
  ci_lower = as.numeric(dl$ci.lb),
  ci_upper = as.numeric(dl$ci.ub),
  tau2 = as.numeric(dl$tau2),
  I2 = as.numeric(dl$I2),
  H2 = as.numeric(dl$H2)
)

cat("DL tau2:", bcg_fixture$DL$tau2, "\n")
cat("DL I2:", bcg_fixture$DL$I2, "%\n")

# REML
reml <- rma(yi, vi, method = "REML")
bcg_fixture$REML <- list(
  estimate = as.numeric(reml$beta),
  se = as.numeric(reml$se),
  ci_lower = as.numeric(reml$ci.lb),
  ci_upper = as.numeric(reml$ci.ub),
  tau2 = as.numeric(reml$tau2),
  I2 = as.numeric(reml$I2)
)

cat("REML tau2:", bcg_fixture$REML$tau2, "\n")

# ML
ml <- rma(yi, vi, method = "ML")
bcg_fixture$ML <- list(
  estimate = as.numeric(ml$beta),
  tau2 = as.numeric(ml$tau2)
)

# PM (Paule-Mandel)
pm <- rma(yi, vi, method = "PM")
bcg_fixture$PM <- list(
  estimate = as.numeric(pm$beta),
  tau2 = as.numeric(pm$tau2)
)

# SJ (Sidik-Jonkman)
sj <- rma(yi, vi, method = "SJ")
bcg_fixture$SJ <- list(
  estimate = as.numeric(sj$beta),
  tau2 = as.numeric(sj$tau2)
)

# HE (Hedges)
he <- rma(yi, vi, method = "HE")
bcg_fixture$HE <- list(
  estimate = as.numeric(he$beta),
  tau2 = as.numeric(he$tau2)
)

# HS (Hunter-Schmidt)
hs <- rma(yi, vi, method = "HS")
bcg_fixture$HS <- list(
  estimate = as.numeric(hs$beta),
  tau2 = as.numeric(hs$tau2)
)

# EB (Empirical Bayes)
eb <- rma(yi, vi, method = "EB")
bcg_fixture$EB <- list(
  estimate = as.numeric(eb$beta),
  tau2 = as.numeric(eb$tau2)
)

# Confidence interval for tau2 (Q-profile method)
ci_tau2 <- confint(reml)
bcg_fixture$tau2_CI <- list(
  method = "Q-profile",
  lower = as.numeric(ci_tau2$random["tau^2", "ci.lb"]),
  upper = as.numeric(ci_tau2$random["tau^2", "ci.ub"]),
  estimate = as.numeric(ci_tau2$random["tau^2", "estimate"])
)

cat("tau2 CI:", bcg_fixture$tau2_CI$lower, "-", bcg_fixture$tau2_CI$upper, "\n")

# Prediction interval
bcg_fixture$prediction_interval <- list(
  lower = as.numeric(predict(reml)$pi.lb),
  upper = as.numeric(predict(reml)$pi.ub)
)

# Publication bias tests
regtest_result <- regtest(reml)
bcg_fixture$egger_test <- list(
  z = as.numeric(regtest_result$zval),
  p = as.numeric(regtest_result$pval),
  intercept = as.numeric(regtest_result$est)
)

# Rank correlation test
ranktest_result <- ranktest(reml)
bcg_fixture$rank_test <- list(
  tau = as.numeric(ranktest_result$tau),
  p = as.numeric(ranktest_result$pval)
)

# Trim and fill
tf <- trimfill(reml)
bcg_fixture$trim_and_fill <- list(
  estimate = as.numeric(tf$beta),
  k_added = as.numeric(tf$k0),
  side = tf$side
)

# Write BCG fixture
write_json(bcg_fixture, file.path(fixtures_dir, "bcg_data.json"), pretty = TRUE, auto_unbox = TRUE)
cat("\nWrote bcg_data.json\n")

# ============================================================================
# Simple 5-study Data
# ============================================================================

cat("\n=== Simple 5-study Data ===\n")

yi_simple <- c(0.5, 0.3, 0.7, 0.4, 0.6)
vi_simple <- c(0.04, 0.05, 0.03, 0.06, 0.04)

simple_fixture <- list(
  description = "Simple 5-study meta-analysis",
  yi = yi_simple,
  vi = vi_simple,
  k = 5
)

# REML
reml_simple <- rma(yi_simple, vi_simple, method = "REML")
simple_fixture$REML <- list(
  estimate = as.numeric(reml_simple$beta),
  se = as.numeric(reml_simple$se),
  tau2 = as.numeric(reml_simple$tau2),
  I2 = as.numeric(reml_simple$I2)
)

# DL
dl_simple <- rma(yi_simple, vi_simple, method = "DL")
simple_fixture$DL <- list(
  estimate = as.numeric(dl_simple$beta),
  tau2 = as.numeric(dl_simple$tau2)
)

write_json(simple_fixture, file.path(fixtures_dir, "simple_data.json"), pretty = TRUE, auto_unbox = TRUE)
cat("Wrote simple_data.json\n")

# ============================================================================
# Homogeneous Data (Zero Heterogeneity)
# ============================================================================

cat("\n=== Homogeneous Data ===\n")

yi_hom <- c(0.5, 0.5, 0.5, 0.5)
vi_hom <- c(0.1, 0.1, 0.1, 0.1)

hom_fixture <- list(
  description = "Homogeneous data (no heterogeneity)",
  yi = yi_hom,
  vi = vi_hom,
  k = 4
)

reml_hom <- rma(yi_hom, vi_hom, method = "REML")
hom_fixture$REML <- list(
  estimate = as.numeric(reml_hom$beta),
  tau2 = as.numeric(reml_hom$tau2),
  I2 = as.numeric(reml_hom$I2),
  Q = as.numeric(reml_hom$QE)
)

write_json(hom_fixture, file.path(fixtures_dir, "homogeneous_data.json"), pretty = TRUE, auto_unbox = TRUE)
cat("Wrote homogeneous_data.json\n")

# ============================================================================
# Edge Cases
# ============================================================================

cat("\n=== Edge Cases ===\n")

edge_cases <- list()

# Two studies
yi_two <- c(0.5, 0.3)
vi_two <- c(0.1, 0.1)
dl_two <- rma(yi_two, vi_two, method = "DL")
edge_cases$two_studies <- list(
  yi = yi_two,
  vi = vi_two,
  DL = list(
    estimate = as.numeric(dl_two$beta),
    tau2 = as.numeric(dl_two$tau2)
  )
)

# Very small variances
yi_small_v <- c(0.5, 0.6, 0.4)
vi_small_v <- c(0.0001, 0.0001, 0.0001)
dl_small <- rma(yi_small_v, vi_small_v, method = "DL")
edge_cases$small_variance <- list(
  yi = yi_small_v,
  vi = vi_small_v,
  DL = list(
    estimate = as.numeric(dl_small$beta),
    tau2 = as.numeric(dl_small$tau2)
  )
)

# Large variances
yi_large_v <- c(0.5, 0.6, 0.4)
vi_large_v <- c(100, 100, 100)
dl_large <- rma(yi_large_v, vi_large_v, method = "DL")
edge_cases$large_variance <- list(
  yi = yi_large_v,
  vi = vi_large_v,
  DL = list(
    estimate = as.numeric(dl_large$beta),
    tau2 = as.numeric(dl_large$tau2)
  )
)

write_json(edge_cases, file.path(fixtures_dir, "edge_cases.json"), pretty = TRUE, auto_unbox = TRUE)
cat("Wrote edge_cases.json\n")

# ============================================================================
# Hartung-Knapp Adjustment
# ============================================================================

cat("\n=== Hartung-Knapp Adjustment ===\n")

# Using BCG data with HK adjustment
hk <- rma(yi, vi, method = "REML", test = "knha")
hk_fixture <- list(
  description = "Hartung-Knapp adjusted inference",
  yi = yi,
  vi = vi,
  REML_HK = list(
    estimate = as.numeric(hk$beta),
    se = as.numeric(hk$se),
    ci_lower = as.numeric(hk$ci.lb),
    ci_upper = as.numeric(hk$ci.ub),
    t = as.numeric(hk$zval),  # t-value with HK
    df = as.numeric(hk$ddf),
    p = as.numeric(hk$pval),
    tau2 = as.numeric(hk$tau2)
  )
)

write_json(hk_fixture, file.path(fixtures_dir, "hartung_knapp.json"), pretty = TRUE, auto_unbox = TRUE)
cat("Wrote hartung_knapp.json\n")

# ============================================================================
# Summary
# ============================================================================

cat("\n=== Summary ===\n")
cat("Generated fixtures:\n")
cat("  - bcg_data.json (13 studies, all tau2 methods, pub bias tests)\n")
cat("  - simple_data.json (5 studies)\n")
cat("  - homogeneous_data.json (4 identical studies)\n")
cat("  - edge_cases.json (2 studies, extreme variances)\n")
cat("  - hartung_knapp.json (HK-adjusted inference)\n")
cat("\nAll fixtures use R metafor package as reference.\n")
