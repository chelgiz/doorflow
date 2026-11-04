ALTER TABLE "Order"
  ADD CONSTRAINT "Order_financial_amounts_check"
  CHECK (
    "subtotalMinor" >= 0
    AND "discountMinor" >= 0
    AND "discountMinor" <= "subtotalMinor"
    AND "totalMinor" = "subtotalMinor" - "discountMinor"
    AND ("costMinor" IS NULL OR "costMinor" >= 0)
    AND "prepaymentMinor" >= 0
    AND "prepaymentMinor" <= "totalMinor"
    AND "balanceMinor" >= 0
    AND "prepaymentMinor" + "balanceMinor" = "totalMinor"
  );

ALTER TABLE "OrderPayment"
  ADD CONSTRAINT "OrderPayment_amount_positive_check"
  CHECK ("amountMinor" > 0);

CREATE FUNCTION "doorflow_reject_history_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'This operational history is append-only';
END;
$$;

CREATE TRIGGER "OrderPayment_append_only"
BEFORE UPDATE OR DELETE ON "OrderPayment"
FOR EACH ROW EXECUTE FUNCTION "doorflow_reject_history_mutation"();

CREATE TRIGGER "OperationAudit_append_only"
BEFORE UPDATE OR DELETE ON "OperationAudit"
FOR EACH ROW EXECUTE FUNCTION "doorflow_reject_history_mutation"();

CREATE TRIGGER "CustomerActivity_append_only"
BEFORE UPDATE OR DELETE ON "CustomerActivity"
FOR EACH ROW EXECUTE FUNCTION "doorflow_reject_history_mutation"();

CREATE FUNCTION "doorflow_protect_order_snapshot"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Orders are financial records and cannot be deleted';
  END IF;

  IF ROW(
    NEW."storeId",
    NEW."leadId",
    NEW."managerId",
    NEW."createdById",
    NEW."customerName",
    NEW."phone",
    NEW."address",
    NEW."currency",
    NEW."configurationSnapshot",
    NEW."sourceQuoteSnapshot",
    NEW."subtotalMinor",
    NEW."discountMinor",
    NEW."totalMinor",
    NEW."costMinor",
    NEW."createdAt"
  ) IS DISTINCT FROM ROW(
    OLD."storeId",
    OLD."leadId",
    OLD."managerId",
    OLD."createdById",
    OLD."customerName",
    OLD."phone",
    OLD."address",
    OLD."currency",
    OLD."configurationSnapshot",
    OLD."sourceQuoteSnapshot",
    OLD."subtotalMinor",
    OLD."discountMinor",
    OLD."totalMinor",
    OLD."costMinor",
    OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'Order snapshots and agreed amounts are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Order_financial_snapshot_immutable"
BEFORE UPDATE OR DELETE ON "Order"
FOR EACH ROW EXECUTE FUNCTION "doorflow_protect_order_snapshot"();
