arguments <- commandArgs(trailingOnly = TRUE)
script_argument <- grep("^--file=", commandArgs(), value = TRUE)
script_path <- if (length(script_argument)) {
  sub("^--file=", "", script_argument[[1]])
} else {
  file.path("analysis", "erflow_analysis.R")
}
project_root <- normalizePath(file.path(dirname(script_path), ".."), mustWork = FALSE)
input_path <- if (length(arguments)) {
  arguments[[1]]
} else {
  file.path(project_root, "data", "sample_patients.csv")
}
output_dir <- file.path(project_root, "analysis", "output")

if (!file.exists(input_path)) {
  stop(sprintf("Patient dataset not found: %s", input_path), call. = FALSE)
}

patients <- read.csv(input_path, stringsAsFactors = FALSE, check.names = FALSE)
required_columns <- c("id", "name", "age", "severity", "requiredUnit")
missing_columns <- setdiff(required_columns, names(patients))
if (length(missing_columns)) {
  stop(
    sprintf("Dataset is missing required columns: %s", paste(missing_columns, collapse = ", ")),
    call. = FALSE
  )
}

patients$id <- trimws(as.character(patients$id))
patients$name <- trimws(as.character(patients$name))
patients$requiredUnit <- trimws(as.character(patients$requiredUnit))
patients$age <- suppressWarnings(as.numeric(patients$age))
patients$severity <- suppressWarnings(as.numeric(patients$severity))
valid_rows <- !is.na(patients$id) & nzchar(patients$id) &
  !is.na(patients$name) & nzchar(patients$name) &
  !is.na(patients$requiredUnit) & nzchar(patients$requiredUnit) &
  !is.na(patients$age) & patients$age >= 1 & patients$age <= 120 &
  !is.na(patients$severity) & patients$severity >= 1 & patients$severity <= 10
patients <- patients[valid_rows, , drop = FALSE]

if (!nrow(patients)) {
  stop("No valid patient records remain after preprocessing.", call. = FALSE)
}
if (nrow(patients) < 2) {
  stop("At least two valid patient records are needed to fit the demonstration model.", call. = FALSE)
}

dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)

unit_counts <- aggregate(id ~ requiredUnit, data = patients, FUN = length)
names(unit_counts)[names(unit_counts) == "id"] <- "patient_count"
unit_severity <- aggregate(severity ~ requiredUnit, data = patients, FUN = mean)
names(unit_severity)[names(unit_severity) == "severity"] <- "mean_severity"
unit_summary <- merge(unit_counts, unit_severity, by = "requiredUnit", sort = TRUE)
write.csv(
  unit_summary,
  file.path(output_dir, "patient_summary_by_unit.csv"),
  row.names = FALSE
)

png(file.path(output_dir, "severity_by_unit.png"), width = 900, height = 650)
severity_plot <- barplot(
  height = unit_summary$mean_severity,
  names.arg = unit_summary$requiredUnit,
  ylim = c(0, 10),
  col = "#2f89b5",
  border = NA,
  main = "Mean triage severity by unit",
  xlab = "Required unit",
  ylab = "Mean severity (1-10)"
)
text(
  x = severity_plot,
  y = unit_summary$mean_severity,
  labels = round(unit_summary$mean_severity, 1),
  pos = 3
)
dev.off()

model_formula <- if (length(unique(patients$age)) > 1) {
  severity ~ age
} else {
  severity ~ 1
}
severity_model <- lm(model_formula, data = patients)
predictions <- data.frame(
  id = patients$id,
  observed_severity = patients$severity,
  predicted_severity = as.numeric(predict(severity_model, newdata = patients))
)
write.csv(
  predictions,
  file.path(output_dir, "patient_severity_predictions.csv"),
  row.names = FALSE
)
saveRDS(severity_model, file.path(output_dir, "severity_model.rds"))
capture.output(
  summary(severity_model),
  file = file.path(output_dir, "severity_model_summary.txt")
)

png(file.path(output_dir, "age_vs_severity.png"), width = 900, height = 650)
plot(
  patients$age,
  patients$severity,
  pch = 19,
  col = "#2f89b5",
  xlab = "Patient age",
  ylab = "Triage severity (1-10)",
  main = "Patient age and triage severity"
)
if (length(unique(patients$age)) > 1) {
  abline(severity_model, col = "#d45555", lwd = 2)
}
dev.off()

message(sprintf("Analyzed %d valid patient records.", nrow(patients)))
message(sprintf("Summary, plots, predictions, and model saved to: %s", output_dir))
