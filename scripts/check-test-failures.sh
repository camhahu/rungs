#!/bin/bash

# Simple script to analyze bun test output and detect failures
# Usage: bun test 2>&1 | bash scripts/check-test-failures.sh
# Or: bash scripts/check-test-failures.sh < test-output.txt

# Read all input
input=$(cat)

# Count failures and passes
fail_count=$(echo "$input" | grep -c "^(fail)")
pass_count=$(echo "$input" | grep -c "^(pass)")

# Look for actual test failure errors (not just any error: line)
has_errors=$(echo "$input" | grep -q "^error:.*expect(" && echo "yes" || echo "no")

# Extract failing test names
failing_tests=$(echo "$input" | grep "^(fail)" | sed 's/^(fail) //' | sed 's/ \[.*\]$//')

echo "=== TEST RESULTS SUMMARY ==="
echo "Passed: $pass_count"
echo "Failed: $fail_count"
echo "Has Errors: $has_errors"

if [ "$fail_count" -gt 0 ] || [ "$has_errors" = "yes" ]; then
    echo ""
    echo "=== FAILING TESTS ==="
    echo "$failing_tests"
    echo ""
    echo "❌ TESTS FAILED - Check output above for details"
    exit 1
else
    echo ""
    echo "✅ ALL TESTS PASSED"
    exit 0
fi