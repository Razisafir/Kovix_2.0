/*---------------------------------------------------------------------------------------------
 *  Construct IDE - Workflow Content / Webview Handler Registration
 *  Phase 27: Pricing webview handlers + constructor injections
 *
 *  This module wires ICreditSystem and ICostGovernor into the Construct
 *  agent panel via webview message handlers. Previous phases (17-26)
 *  registered their handlers here; Phase 27 adds 14 pricing handlers.
 *--------------------------------------------------------------------------------------------*/

import { ICreditSystem, ICostGovernor } from '../../../../platform/construct/common/pricing/creditSystem.js';
import {
        CreditActionType,
        SubscriptionTier,
        ICreditBudget,
        IPricingAlert,
        ICreditUsage,
} from '../../../../platform/construct/common/pricing/pricingTypes.js';

/**
 * Register pricing-related webview message handlers.
 *
 * Call this from the ConstructAgentViewPane (or equivalent webview host)
 * after the webview is ready. Each handler receives a message payload
 * and returns a serialisable result that is posted back to the webview.
 */
export function registerPricingHandlers(
        creditSystem: ICreditSystem,
        costGovernor: ICostGovernor,
        postMessage: (channel: string, data: unknown) => void,
): Map<string, (payload: any) => Promise<unknown> | unknown> {
        const handlers = new Map<string, (payload: any) => Promise<unknown> | unknown>();

        // ── pricing:getStatus ──────────────────────────────────
        // Returns current subscription, credits, and usage summary.
        handlers.set('pricing:getStatus', (_payload: any) => {
                const subscription = creditSystem.getSubscription();
                const remaining = creditSystem.getCreditsRemaining();
                const total = creditSystem.getCreditsTotal();
                const usedThisMonth = creditSystem.getUsageThisMonth();
                const usedToday = creditSystem.getUsageToday();
                const tier = creditSystem.getCurrentTier();

                return {
                        tier,
                        subscription,
                        creditsRemaining: remaining,
                        creditsTotal: total,
                        usedThisMonth,
                        usedToday,
                        emergencyMode: costGovernor.isEmergencyMode(),
                        autoSwitchRecommended: costGovernor.shouldAutoSwitchModel(),
                };
        });

        // ── pricing:getHistory ─────────────────────────────────
        // Returns usage history with optional limit and date filters.
        handlers.set('pricing:getHistory', (payload: { limit?: number; startDate?: number; endDate?: number }) => {
                return creditSystem.getUsageHistory(payload.limit, payload.startDate, payload.endDate);
        });

        // ── pricing:getBreakdown ───────────────────────────────
        // Returns usage breakdown by action type.
        handlers.set('pricing:getBreakdown', (_payload: any) => {
                const breakdown = creditSystem.getUsageByActionType();
                // Convert Map to plain object for serialisation
                const result: Record<string, number> = {};
                for (const [key, value] of breakdown) {
                        result[key] = value;
                }
                return result;
        });

        // ── pricing:estimate ───────────────────────────────────
        // Returns cost estimate for a prompt + model combination.
        handlers.set('pricing:estimate', (payload: { prompt: string; model: string }) => {
                return creditSystem.estimateCost(payload.prompt, payload.model);
        });

        // ── pricing:estimatePlan ───────────────────────────────
        // Returns estimated credit cost for a multi-agent execution plan.
        handlers.set('pricing:estimatePlan', (payload: { agentCount: number; estimatedSteps: number; model: string }) => {
                const credits = creditSystem.estimatePlanCost(payload);
                return { estimatedCredits: credits };
        });

        // ── pricing:setBudget ──────────────────────────────────
        // Sets budget caps and warning thresholds.
        handlers.set('pricing:setBudget', (payload: ICreditBudget) => {
                creditSystem.setBudget(payload);
                return { success: true };
        });

        // ── pricing:getBudget ──────────────────────────────────
        // Returns current budget configuration.
        handlers.set('pricing:getBudget', (_payload: any) => {
                return creditSystem.getBudget();
        });

        // ── pricing:getAlerts ──────────────────────────────────
        // Returns active pricing alerts.
        handlers.set('pricing:getAlerts', (_payload: any) => {
                return creditSystem.getAlerts();
        });

        // ── pricing:upgrade ────────────────────────────────────
        // Opens the upgrade/payment flow.
        handlers.set('pricing:upgrade', (_payload: any) => {
                creditSystem.upgradeFlow();
                return { success: true };
        });

        // ── pricing:purchase ───────────────────────────────────
        // Purchases one-time top-up credits.
        handlers.set('pricing:purchase', async (payload: { amount: number }) => {
                const success = await creditSystem.purchaseCredits(payload.amount);
                return { success };
        });

        // ── pricing:getPricingTable ────────────────────────────
        // Returns the full pricing table for all tiers.
        handlers.set('pricing:getPricingTable', (_payload: any) => {
                return creditSystem.getPricingTable();
        });

        // ── pricing:consume ────────────────────────────────────
        // Consumes credits for a given action (used for testing/manual consumption).
        handlers.set('pricing:consume', (payload: { amount: number; actionType: CreditActionType; metadata?: { model?: string; sessionId?: string; agentType?: string; description?: string } }) => {
                const success = creditSystem.consumeCredits(payload.amount, payload.actionType, payload.metadata);
                return { success };
        });

        // ── pricing:exportUsage ────────────────────────────────
        // Exports usage history as CSV.
        handlers.set('pricing:exportUsage', (_payload: any) => {
                const csv = creditSystem.exportUsageCSV();
                return { csv };
        });

        // ── pricing:simulateTier ───────────────────────────────
        // Simulates a tier change (dev mode only).
        handlers.set('pricing:simulateTier', (payload: { tier: SubscriptionTier }) => {
                creditSystem.simulateTier(payload.tier);
                return { success: true };
        });

        // ── Subscribe to credit events and forward to webview ──
        creditSystem.onCreditsChanged((e: { remaining: number; total: number; consumed: number }) => {
                postMessage('pricing:creditsChanged', e);
        });

        creditSystem.onBudgetWarning((alert: IPricingAlert) => {
                postMessage('pricing:budgetWarning', alert);
        });

        creditSystem.onEmergencyStop((e: { creditsRemaining: number }) => {
                postMessage('pricing:emergencyStop', e);
        });

        creditSystem.onTierChanged((e: { from: SubscriptionTier; to: SubscriptionTier }) => {
                postMessage('pricing:tierChanged', e);
        });

        creditSystem.onUsageRecorded((usage: ICreditUsage) => {
                postMessage('pricing:usageRecorded', usage);
        });

        return handlers;
}
