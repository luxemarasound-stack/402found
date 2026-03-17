import { Permission, Violation, GuardResult } from "./types.js";

// Dangerous actions that always get flagged if not explicitly permitted
const DANGEROUS_ACTIONS = new Set([
  "delete",
  "drop",
  "truncate",
  "execute",
  "admin",
  "sudo",
  "transfer",
  "deploy",
  "shutdown",
  "destroy",
  "purge",
  "override",
]);

// Resource escalation patterns — requesting broader access than granted
function isEscalation(granted: string, requested: string): boolean {
  // Wildcard grant covers everything under that prefix
  if (granted === "*") return false;
  if (granted.endsWith("/*")) {
    const prefix = granted.slice(0, -1);
    if (requested.startsWith(prefix)) return false;
  }
  // Exact match
  if (granted === requested) return false;
  // Requesting a parent of what's granted = escalation
  if (granted.startsWith(requested) && requested !== granted) return true;
  // Different resource entirely
  return true;
}

// Check if an action is covered by the granted actions list
function isActionAllowed(grantedActions: string[], requestedAction: string): boolean {
  const lower = requestedAction.toLowerCase();
  for (const granted of grantedActions) {
    if (granted === "*") return true;
    if (granted.toLowerCase() === lower) return true;
    // "write" implies "create" and "update"
    if (granted.toLowerCase() === "write" && (lower === "create" || lower === "update")) return true;
    // "readwrite" implies all CRUD
    if (granted.toLowerCase() === "readwrite") return true;
  }
  return false;
}

export function checkPermission(
  action: string,
  resource: string,
  scope: Permission[]
): GuardResult {
  const violations: Violation[] = [];

  // No scope defined = deny everything
  if (scope.length === 0) {
    violations.push({
      action,
      resource,
      reason: "No permissions defined — agent has an empty scope",
      severity: "denied",
    });
    return { allowed: false, violations, checked_action: action, checked_resource: resource, scope_size: 0 };
  }

  // Check if any permission entry covers this resource
  const matchingPerms = scope.filter((p) => {
    if (p.resource === "*") return true;
    if (p.resource.endsWith("/*")) {
      return resource.startsWith(p.resource.slice(0, -1)) || resource === p.resource.slice(0, -2);
    }
    return p.resource === resource;
  });

  if (matchingPerms.length === 0) {
    // No permission covers this resource — check if it looks like escalation
    const closestGrant = scope.map((p) => p.resource).join(", ");
    violations.push({
      action,
      resource,
      reason: `Resource "${resource}" is not in agent's scope. Granted resources: ${closestGrant}`,
      severity: "denied",
    });
    return { allowed: false, violations, checked_action: action, checked_resource: resource, scope_size: scope.length };
  }

  // Check if the action is allowed on any matching resource permission
  const actionAllowed = matchingPerms.some((p) => isActionAllowed(p.actions, action));

  if (!actionAllowed) {
    const grantedActions = matchingPerms.flatMap((p) => p.actions);
    violations.push({
      action,
      resource,
      reason: `Action "${action}" is not permitted. Allowed actions: ${grantedActions.join(", ")}`,
      severity: "denied",
    });
  }

  // Flag dangerous actions even if technically permitted — as a warning
  if (DANGEROUS_ACTIONS.has(action.toLowerCase()) && actionAllowed) {
    violations.push({
      action,
      resource,
      reason: `Action "${action}" is a dangerous operation — flagged for review even though it is within scope`,
      severity: "warning",
    });
  }

  // Check for resource escalation patterns
  for (const perm of scope) {
    if (isEscalation(perm.resource, resource) && perm.resource !== "*") {
      // Only flag if no other perm already covers it
      if (matchingPerms.length === 0) {
        violations.push({
          action,
          resource,
          reason: `Requesting "${resource}" may escalate beyond granted "${perm.resource}"`,
          severity: "warning",
        });
      }
    }
  }

  const denied = violations.some((v) => v.severity === "denied");

  return {
    allowed: !denied,
    violations,
    checked_action: action,
    checked_resource: resource,
    scope_size: scope.length,
  };
}
