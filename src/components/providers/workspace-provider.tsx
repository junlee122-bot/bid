"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { demoContracts } from "@/data/demo";
import type { ContractRecord } from "@/lib/domain";

type WorkspaceSource = "demo" | "csv" | "api" | "mixed";

interface PersistedWorkspace {
  version: 1;
  contracts: ContractRecord[];
  source: WorkspaceSource;
  updatedAt: string;
}

interface WorkspaceContextValue {
  contracts: ContractRecord[];
  source: WorkspaceSource;
  updatedAt: string;
  hydrated: boolean;
  replaceContracts: (records: ContractRecord[], source: Exclude<WorkspaceSource, "mixed">) => void;
  appendContracts: (records: ContractRecord[], source: Exclude<WorkspaceSource, "mixed">) => void;
  updateContract: (record: ContractRecord) => void;
  removeContract: (contractId: string) => void;
  resetDemo: () => void;
}

const STORAGE_KEY = "bid-shield.workspace.v1";
const DEMO_UPDATED_AT = "2026-07-13T00:00:00.000Z";
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function hasValidProvenance(value: unknown): boolean {
  if (!isObject(value)) return false;
  const company = value.company;
  const procurement = value.procurement;
  const fields = value.fields;
  if (!isObject(company) || !isObject(procurement) || !isObject(fields)) return false;

  const financials = company.financials;
  if (!isObject(financials)) return false;
  const requiredFinancials = [
    "annualRevenueKrw",
    "operatingProfitKrw",
    "cashAndEquivalentsKrw",
    "currentAssetsKrw",
    "currentLiabilitiesKrw",
    "totalDebtKrw",
  ] as const;
  const nullableFinancials = [
    "existingOrderBacklogKrw",
    "averageCollectionDays",
    "averagePaymentDays",
  ] as const;

  const validFields = Object.values(fields).every(
    (field) =>
      isObject(field) &&
      ["procurement", "company-financial-csv", "user-input", "model"].includes(
        String(field.origin),
      ) &&
      ["source", "user-assumption", "model-derived"].includes(String(field.evidence)) &&
      (field.detail === undefined || typeof field.detail === "string") &&
      (field.asOfDate === undefined || isNullableString(field.asOfDate)),
  );

  return (
    typeof company.stableKey === "string" &&
    company.source === "company-financial-csv" &&
    isNullableString(company.asOfDate) &&
    requiredFinancials.every((field) => isFiniteNumber(financials[field])) &&
    nullableFinancials.every((field) => isNullableNumber(financials[field])) &&
    ["notice", "award", "contract"].includes(String(procurement.resource)) &&
    ["construction", "service", "goods"].includes(String(procurement.kind)) &&
    ["koneps-live", "demo"].includes(String(procurement.source)) &&
    isNullableString(procurement.referenceUrl) &&
    isNullableString(procurement.winnerName) &&
    ["opportunity", "awarded", "contracted"].includes(
      String(procurement.lifecycleStage),
    ) &&
    ["matched", "mismatch", "unknown", "not-applicable"].includes(
      String(procurement.bidderMatch),
    ) &&
    validFields &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === "string")
  );
}

function isContractRecord(value: unknown): value is ContractRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const stringFields = [
    "id",
    "procurementId",
    "title",
    "companyName",
    "industry",
    "region",
    "buyer",
    "awardedAt",
  ] as const;
  const numericFields = [
    "contractAmountKrw",
    "baseAmountKrw",
    "bidRatePct",
    "estimatedTotalCostKrw",
    "availableCashKrw",
    "monthlyOperatingCashOutflowKrw",
    "existingBorrowingsKrw",
    "monthlyDebtServiceKrw",
    "annualInterestRatePct",
    "durationMonths",
    "paymentDelayDays",
    "advancePaymentRatePct",
    "retentionRatePct",
    "guaranteeDepositRatePct",
    "upfrontCostRatePct",
    "fixedCostRatePct",
  ] as const;

  return (
    stringFields.every((field) => typeof record[field] === "string") &&
    numericFields.every((field) => {
      const fieldValue = record[field];
      return typeof fieldValue === "number" && Number.isFinite(fieldValue);
    }) &&
    ["micro", "small", "medium", "large"].includes(String(record.companySize)) &&
    ["monthly", "milestone", "completion"].includes(String(record.paymentSchedule)) &&
    ["verified", "estimated", "synthetic"].includes(String(record.dataQuality)) &&
    typeof record.isSynthetic === "boolean" &&
    (record.description === undefined || typeof record.description === "string") &&
    (record.provenance === undefined || hasValidProvenance(record.provenance))
  );
}

function now(): string {
  return new Date().toISOString();
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [contracts, setContracts] = useState<ContractRecord[]>(demoContracts);
  const [source, setSource] = useState<WorkspaceSource>("demo");
  const [updatedAt, setUpdatedAt] = useState(DEMO_UPDATED_AT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Defer the external-store snapshot until after the hydration commit. This
    // keeps the server/client first render identical and is Strict Mode safe.
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const stored = JSON.parse(raw) as Partial<PersistedWorkspace>;
          const validRecords = Array.isArray(stored.contracts)
            ? stored.contracts.filter(isContractRecord).slice(0, 5_000)
            : [];
          if (stored.version === 1 && validRecords.length > 0) {
            const storedSource = String(stored.source ?? "");
            const nextSource: WorkspaceSource = ["demo", "csv", "api", "mixed"].includes(storedSource)
              ? (storedSource as WorkspaceSource)
              : "csv";
            const nextUpdatedAt =
              typeof stored.updatedAt === "string" && Number.isFinite(Date.parse(stored.updatedAt))
                ? stored.updatedAt
                : now();
            setContracts(validRecords);
            setSource(nextSource);
            setUpdatedAt(nextUpdatedAt);
          }
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload: PersistedWorkspace = { version: 1, contracts, source, updatedAt };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Quota or privacy-mode failures must not break analysis in memory.
    }
  }, [contracts, hydrated, source, updatedAt]);

  const replaceContracts = useCallback(
    (records: ContractRecord[], nextSource: Exclude<WorkspaceSource, "mixed">) => {
      const valid = records.filter(isContractRecord).slice(0, 5_000);
      if (valid.length === 0) return;
      setContracts(valid);
      setSource(nextSource);
      setUpdatedAt(now());
    },
    [],
  );

  const appendContracts = useCallback(
    (records: ContractRecord[], nextSource: Exclude<WorkspaceSource, "mixed">) => {
      const valid = records.filter(isContractRecord);
      if (valid.length === 0) return;
      setContracts((current) => {
        const byId = new Map(current.map((record) => [record.id, record]));
        for (const record of valid) byId.set(record.id, record);
        return Array.from(byId.values()).slice(0, 5_000);
      });
      setSource((current) => (current === nextSource ? current : "mixed"));
      setUpdatedAt(now());
    },
    [],
  );

  const updateContract = useCallback((record: ContractRecord) => {
    if (!isContractRecord(record)) return;
    setContracts((current) => current.map((item) => (item.id === record.id ? record : item)));
    setUpdatedAt(now());
  }, []);

  const removeContract = useCallback((contractId: string) => {
    setContracts((current) => current.filter((record) => record.id !== contractId));
    setUpdatedAt(now());
  }, []);

  const resetDemo = useCallback(() => {
    setContracts(demoContracts);
    setSource("demo");
    setUpdatedAt(now());
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({ contracts, source, updatedAt, hydrated, replaceContracts, appendContracts, updateContract, removeContract, resetDemo }),
    [appendContracts, contracts, hydrated, removeContract, replaceContracts, resetDemo, source, updateContract, updatedAt],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}
