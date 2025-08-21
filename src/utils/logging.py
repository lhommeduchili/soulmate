from __future__ import annotations

import logging
from logging import Logger
from typing import Optional


def setup_logger(name: str = "sss", logfile: Optional[str] = None, level: int = logging.INFO) -> Logger:
    logger = logging.getLogger(name)
    logger.setLevel(level)
    if not logger.handlers:
        ch = logging.StreamHandler()
        ch.setLevel(level)
        ch.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
        logger.addHandler(ch)
        if logfile:
            fh = logging.FileHandler(logfile, encoding="utf-8")
            fh.setLevel(level)
            fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
            logger.addHandler(fh)
    return logger
