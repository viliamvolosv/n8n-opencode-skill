FROM ghcr.io/anomalyco/opencode:2.0.28@sha256:5b66f1cf397efdf6ea09e247d8f57dfac67a00731914b74f09746137f43a0ae8
RUN apk add --no-cache nodejs docker-cli docker-cli-compose
WORKDIR /work
COPY skills/ /work/.opencode/skills/
COPY tests/docker/*.mjs /opt/skill-test/
COPY upstream.json /opt/upstream.json
ENTRYPOINT ["node", "/opt/skill-test/integration.mjs"]
