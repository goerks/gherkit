//go:build windows

package runner

import (
	"context"
	"os/exec"
	"syscall"
)

// shellCmd runs command through cmd.exe. The command line is handed over as it
// is: Go would otherwise escape the quotes in it, and cmd /S /C "..." strips
// only the outer pair, so quoted paths with spaces keep working.
func shellCmd(ctx context.Context, command string) *exec.Cmd {
	c := exec.CommandContext(ctx, "cmd")
	c.SysProcAttr = &syscall.SysProcAttr{CmdLine: `cmd /S /C "` + command + `"`}
	return c
}
