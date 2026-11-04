CREATE TRIGGER "Measurement_history_retained"
BEFORE DELETE ON "Measurement"
FOR EACH ROW EXECUTE FUNCTION "doorflow_reject_history_mutation"();

CREATE TRIGGER "Installation_history_retained"
BEFORE DELETE ON "Installation"
FOR EACH ROW EXECUTE FUNCTION "doorflow_reject_history_mutation"();
