export const methods = ["DC", "CMM", "VS", "VMS", "HG", "MIC", "CG", "PP", "TG", "PG"];
export const types = ["dimension", "gdt", "note", "visual"];
export const TYPE_DEFAULT_METHOD = { dimension: "DC", gdt: "CMM", note: "VS", visual: "VS" };
export const CHARACTERISTIC_FIELDS = ["nominal", "tolerance", "notes"];
export const APP_VERSION = "v0.5.0";

export const PANEL_STORAGE_KEY = "qca_panel_sizes_v1";
export const RESIZE_HANDLE_SIZE = 14;
export const ZOOM_DEFAULT = 1.15;
export const ZOOM_MIN = 0.65;
export const ZOOM_MAX = 2.2;
export const ZOOM_STEP = 0.1;
export const BALLOON_OFFSET = { x: 0.0375, y: -0.0275 };
export const BALLOON_MARGIN = 0.025;
export const AUTO_BALLOON_EDGE_OFFSET = 0.055;
export const AUTO_BALLOON_LEADER_RATIO = 0.5;
export const AUTO_BALLOON_MIN_SPACING = 0.04;
export const AUTO_BALLOON_MIN_CONFIDENCE = 45;
export const AUTO_BALLOON_MAX_LABEL_LENGTH = 28;
export const DRAWING_NUMBER_PATTERN = /(?:^|[\s(])(?:[+-]?\d+(?:\.\d+)?x?|[rm]\s*\d+(?:\.\d+)?|[øØ]\s*\d+(?:\.\d+)?|\+\/-\s*\d+(?:\.\d+)?)(?:$|[\s),;:]|max|min)/i;

export const defaultPanelSizes = {
  splitV: {
    inspectorWidth: 330,
    tableHeight: 290,
  },
  splitH: {
    drawingWidth: null,
    inspectorHeight: 260,
  },
};

export const emptyMetadata = {
  drawingNo: "",
  revision: "",
  supplier: "",
  description: "",
};

export const emptyToleranceOverrides = { linear: {}, angle: {} };
