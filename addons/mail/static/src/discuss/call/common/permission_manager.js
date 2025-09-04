import { PermissionDialog } from "@mail/discuss/call/common/permission_dialog";

export class PermissionManager {
    constructor(overlay) {
        this.overlay = overlay;
        this.activeDialog = null;
    }

    closeDialog() {
        this.activeDialog?.();
        this.activeDialog = null;
    }

    showPermissionDialog(permissionType, onPrimary, onSecondary, onClose) {
        this.closeDialog();
        const closeDialog = this.overlay.add(PermissionDialog, {
            permissionType,
            close: () => this.closeDialog(),
            onClose: onClose,
            onPrimaryAction: onPrimary,
            onSecondaryAction: onSecondary,
        });
        this.activeDialog = () => closeDialog();
        return this.activeDialog;
    }
}
