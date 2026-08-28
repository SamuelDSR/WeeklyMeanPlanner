// 极简断言，够用就行 —— 不引测试框架，node 直接跑。
export function makeSuite(name) {
  let pass = 0;
  let fail = 0;
  const failures = [];

  const eq = (label, got, want) => {
    const a = JSON.stringify(got);
    const b = JSON.stringify(want);
    if (a === b) {
      pass += 1;
    } else {
      fail += 1;
      failures.push(`  ✗ ${label}\n      得到 ${a}\n      期望 ${b}`);
    }
  };
  const ok = (label, result) => {
    if (result && !result.error) pass += 1;
    else {
      fail += 1;
      failures.push(`  ✗ ${label} —— 应该通过，却是 ${JSON.stringify(result)}`);
    }
  };
  const rejects = (label, result) => {
    if (result && result.error) pass += 1;
    else {
      fail += 1;
      failures.push(`  ✗ ${label} —— 应该被拒，却通过了`);
    }
  };
  const done = () => {
    const line = `${name}: ${pass} 通过` + (fail ? `，${fail} 失败` : '');
    console.log(fail ? `\n${line}` : line);
    failures.forEach((f) => console.log(f));
    return fail;
  };

  return { eq, ok, rejects, done };
}
