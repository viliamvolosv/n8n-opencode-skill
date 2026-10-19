FROM gitea/act_runner:0.2.13 AS runner
FROM docker:28-cli AS docker-cli
FROM node:24-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git && rm -rf /var/lib/apt/lists/*
COPY --from=runner /usr/local/bin/act_runner /usr/local/bin/act_runner
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins
ENTRYPOINT ["act_runner"]
