#!/bin/sh

bootstrap_error() {
  printf '%s\n' "bootstrap: $*" >&2
  exit 1
}

bootstrap_require_absolute_path() {
  case "$1" in
    /*) ;;
    *) bootstrap_error "a required path must be absolute" ;;
  esac
}

bootstrap_require_value() {
  [ -n "$1" ] || bootstrap_error "a required installer value is missing"
}

bootstrap_cleanup_staging() {
  if [ -n "${BOOTSTRAP_STAGING_DIRECTORY:-}" ] && [ -d "$BOOTSTRAP_STAGING_DIRECTORY" ]; then
    rm -rf "$BOOTSTRAP_STAGING_DIRECTORY"
  fi
}
