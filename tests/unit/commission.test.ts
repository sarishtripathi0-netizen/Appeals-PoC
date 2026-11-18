import { describe, expect, it } from "vitest";
import { checkBench, tallyVotes } from "@/domain/commission";

const v = (memberId: string, position: string, isCasting = false) => ({ memberId, position, isCasting });
const bench = ["a", "b", "c"];

describe("bench votes", () => {
  it("waits for every member", () => {
    expect(tallyVotes(bench, [v("a", "ALLOW"), v("b", "ALLOW")])).toMatchObject({ complete: false, decided: null, needsCasting: false });
  });

  it("decides by majority and records the dissent", () => {
    const t = tallyVotes(bench, [v("a", "ALLOW"), v("b", "ALLOW"), v("c", "DISMISS")]);
    expect(t).toMatchObject({ complete: true, majority: "ALLOW", decided: "ALLOW", needsCasting: false });
    expect(t.dissenters.map((d) => d.memberId)).toEqual(["c"]);
  });

  it("needs the Chief Commissioner's casting vote on a three-way split, limited to the tied positions", () => {
    const votes = [v("a", "ALLOW"), v("b", "DISMISS"), v("c", "REMAND")];
    expect(tallyVotes(bench, votes)).toMatchObject({ majority: null, needsCasting: true, tie: ["ALLOW", "DISMISS", "REMAND"] });
    expect(tallyVotes(bench, [...votes, v("cc", "REMAND", true)])).toMatchObject({ decided: "REMAND", needsCasting: false });
  });

  it("ignores a casting vote outside the tie and votes from non-members", () => {
    expect(tallyVotes(["a"], [v("a", "DISMISS"), v("x", "ALLOW")])).toMatchObject({ decided: "DISMISS" });
    expect(tallyVotes(["a", "b"], [v("a", "ALLOW"), v("b", "DISMISS"), v("cc", "REMAND", true)])).toMatchObject({ decided: null, needsCasting: true });
  });
});

describe("bench constitution", () => {
  const commissioners = new Set(["a", "b", "c"]);
  it("has one or three Commissioners and a presiding member who sits on it", () => {
    expect(checkBench(["a"], "a", commissioners)).toBeNull();
    expect(checkBench(["a", "b", "c"], "b", commissioners)).toBeNull();
    expect(checkBench(["a", "b"], "a", commissioners)).toMatch(/one or three/);
    expect(checkBench(["a", "b", "x"], "a", commissioners)).toMatch(/Only Commissioners/);
    expect(checkBench(["a"], "b", commissioners)).toMatch(/presiding/);
    expect(checkBench(["a", "a", "b"], "a", commissioners)).toMatch(/only once/);
  });
});
