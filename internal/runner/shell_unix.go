//go:build !windows

package runner

import (
	"context"
	"os/exec"
)

// shellCmd runs command through the POSIX shell.
func shellCmd(ctx context.Context, command string) *exec.Cmd {
	return exec.CommandContext(ctx, "sh", "-c", command)
}
