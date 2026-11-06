/**
 * Branch changes: `switch <base>` and `switch -c <name> <base>`. Both refuse a
 * dirty tree, and the create form never moves the working tree to the base
 * first, which is the difference between `-c name base` and `switch base` +
 * `-c name`.
 */
import { err, ok, type Result } from "../result.ts";
import { validateBranchName, branchExists, rejectOptionLike } from "./refs.ts";
import { prepare, type ActionOutcome, type Deps } from "./actions.ts";

export type SwitchRequest = {
  readonly base: string;
  /** `null` switches to `base`; a name creates a branch from `base`. */
  readonly name: string | null;
};

export async function switchBranch(deps: Deps, request: SwitchRequest): Promise<Result<ActionOutcome>> {
  const prepared = await prepare(deps);
  if (!prepared.ok) return prepared;

  if (prepared.value.dirtyFiles > 0) {
    return err("dirty-tree", `${prepared.value.dirtyFiles} uncommitted files`);
  }

  const base = rejectOptionLike(request.base);
  if (!base.ok) return base;

  if (request.name === null) {
    const result = await deps.run(["switch", request.base], {
      cwd: prepared.value.toplevel,
      timeoutMs: deps.timeouts.tree,
    });
    if (!result.ok) return result;
    if (result.value.code !== 0) return err("rejected", "could not switch branch");
    return ok({ detail: request.base });
  }

  const name = await validateBranchName(deps.run, request.name, prepared.value.toplevel, deps.timeouts.read);
  if (!name.ok) return name;

  const exists = await branchExists(deps.run, request.name, prepared.value.toplevel, deps.timeouts.read);
  if (!exists.ok) return exists;
  if (exists.value) return err("branch-exists", `branch ${request.name} already exists`);

  const result = await deps.run(["switch", "-c", request.name, request.base], {
    cwd: prepared.value.toplevel,
    timeoutMs: deps.timeouts.tree,
  });
  if (!result.ok) return result;
  if (result.value.code !== 0) return err("rejected", `could not create ${request.name} from ${request.base}`);
  return ok({ detail: `${request.name} from ${request.base}` });
}
