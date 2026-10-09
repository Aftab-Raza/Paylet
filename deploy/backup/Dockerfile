FROM postgres:17-bookworm
RUN apt-get update \
    && apt-get install -y --no-install-recommends restic curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --chmod=755 backup.sh restore-test.sh /scripts/
USER postgres
ENTRYPOINT ["/scripts/backup.sh"]
