# 빌드 단계
FROM node:24-alpine AS build

WORKDIR /app

# 전체 프로젝트 종속성 설치
COPY package*.json ./
COPY client/package*.json client/
COPY server/package*.json server/
RUN npm run install:all

# 소스 복사 및 빌드
COPY . .
RUN npm run build

# 실행 단계
FROM node:24-alpine

WORKDIR /app

# 빌드 결과물만 복사
COPY --from=build /app/package*.json ./
COPY --from=build /app/server/package*.json server/
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
COPY --from=build /app/client/public client/public
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/server/node_modules server/node_modules

EXPOSE 3001

CMD ["npm", "start"]
