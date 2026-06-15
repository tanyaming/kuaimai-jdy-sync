-- ============================================
-- 快麦订单同步 - 数据库表结构
-- 目标库: kedouData @ 8.137.123.168
-- ============================================

CREATE DATABASE IF NOT EXISTS `kedouData`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `kedouData`;

-- -------------------------------------------
-- 1. 同步状态表（记录增量拉取游标）
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `sync_state` (
  `id`          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `sync_key`    VARCHAR(64)     NOT NULL COMMENT '同步标识，如 order_last_updtime',
  `sync_value`  VARCHAR(255)    NOT NULL COMMENT '游标值',
  `updated_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sync_key` (`sync_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='同步状态/游标记录';

-- -------------------------------------------
-- 2. 订单主表
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `kuaimai_order` (
  `id`                BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `tid`               VARCHAR(64)      NOT NULL COMMENT '快麦主订单号',
  `sid`               VARCHAR(64)      DEFAULT NULL COMMENT '快麦系统订单ID',
  `source`            VARCHAR(32)      NOT NULL DEFAULT '' COMMENT '平台来源: fxg/kuaishou/taobao/jd/...',
  `shop_id`           VARCHAR(64)      DEFAULT NULL COMMENT '店铺ID',
  `shop_name`         VARCHAR(255)     DEFAULT '' COMMENT '店铺名称',
  `buyer_nick`        VARCHAR(1024)    DEFAULT '' COMMENT '买家昵称(加密)',
  `open_uid`          VARCHAR(1024)    DEFAULT '' COMMENT '平台openUid',
  `receiver_name`     VARCHAR(1024)    DEFAULT '' COMMENT '收件人',
  `receiver_mobile`   VARCHAR(1024)    DEFAULT '' COMMENT '收件人手机(加密)',
  `receiver_state`    VARCHAR(64)      DEFAULT '' COMMENT '省',
  `receiver_city`     VARCHAR(64)      DEFAULT '' COMMENT '市',
  `receiver_district` VARCHAR(64)      DEFAULT '' COMMENT '区',
  `receiver_street`   VARCHAR(255)     DEFAULT '' COMMENT '街道',
  `receiver_address`  VARCHAR(2048)    DEFAULT '' COMMENT '详细地址',
  `payment`           DECIMAL(12,2)    NOT NULL DEFAULT 0.00 COMMENT '实付金额',
  `post_fee`          DECIMAL(12,2)    NOT NULL DEFAULT 0.00 COMMENT '邮费',
  `gross_profit`      DECIMAL(12,2)    NOT NULL DEFAULT 0.00 COMMENT '毛利',
  `sale_price`        DECIMAL(12,2)    NOT NULL DEFAULT 0.00 COMMENT '销售价',
  `item_num`          INT UNSIGNED     NOT NULL DEFAULT 0 COMMENT '商品件数',
  `item_kind_num`     INT UNSIGNED     NOT NULL DEFAULT 0 COMMENT '商品种类数',
  `express_code`      VARCHAR(32)      DEFAULT '' COMMENT '快递公司编码',
  `express_company_id`INT UNSIGNED     DEFAULT NULL COMMENT '快递公司ID',
  `out_sid`           VARCHAR(128)     DEFAULT '' COMMENT '运单号',
  `warehouse_id`      INT UNSIGNED     DEFAULT NULL COMMENT '仓库ID',
  `warehouse_name`    VARCHAR(128)     DEFAULT '' COMMENT '仓库名称',
  `seller_nick`       VARCHAR(1024)    DEFAULT '' COMMENT '卖家昵称',
  `seller_flag`       TINYINT          DEFAULT 0 COMMENT '卖家标记',
  `status`            VARCHAR(32)      DEFAULT '' COMMENT '快麦原始状态',
  `unified_status`    VARCHAR(32)      DEFAULT '' COMMENT '统一状态',
  `sys_status`        VARCHAR(32)      DEFAULT '' COMMENT '系统状态',
  `is_refund`         TINYINT          DEFAULT 0 COMMENT '是否退款',
  `is_halt`           TINYINT          DEFAULT 0 COMMENT '是否挂起',
  `is_urgent`         TINYINT          DEFAULT 0 COMMENT '是否加急',
  `is_excep`          TINYINT          DEFAULT 0 COMMENT '是否异常',
  `pay_time`          DATETIME         DEFAULT NULL COMMENT '付款时间',
  `consign_time`      DATETIME         DEFAULT NULL COMMENT '发货时间',
  `end_time`          DATETIME         DEFAULT NULL COMMENT '完成时间',
  `created_at`        DATETIME         DEFAULT NULL COMMENT '订单创建时间',
  `upd_time`          DATETIME         NOT NULL COMMENT '快麦最后更新时间',
  `scalping`          TINYINT          DEFAULT 0 COMMENT '是否刷单',
  `trade_tags`        JSON             DEFAULT NULL COMMENT '订单标签JSON',
  `raw_json`          JSON             DEFAULT NULL COMMENT '原始JSON(备用)',
  `synced_at`         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '本记录同步时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tid` (`tid`),
  KEY `idx_source` (`source`),
  KEY `idx_status` (`unified_status`),
  KEY `idx_pay_time` (`pay_time`),
  KEY `idx_upd_time` (`upd_time`),
  KEY `idx_shop_name` (`shop_name`),
  KEY `idx_synced_at` (`synced_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='快麦订单主表';

-- -------------------------------------------
-- 3. 订单明细表
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS `kuaimai_order_item` (
  `id`                  BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `tid`                 VARCHAR(64)      NOT NULL COMMENT '关联主订单号',
  `oid`                 VARCHAR(64)      NOT NULL COMMENT '快麦子订单号',
  `sid`                 VARCHAR(64)      DEFAULT NULL COMMENT '快麦系统订单ID',
  `num_iid`             VARCHAR(64)      DEFAULT '' COMMENT '平台商品ID',
  `source`              VARCHAR(32)      NOT NULL DEFAULT '' COMMENT '平台来源',
  `outer_sku_id`        VARCHAR(128)     DEFAULT '' COMMENT '商家SKU编码(outerSkuId)',
  `sku_id`              VARCHAR(64)      DEFAULT '' COMMENT '快麦系统SKU ID',
  `title`               VARCHAR(512)     DEFAULT '' COMMENT '商品标题',
  `sku_properties_name` VARCHAR(512)     DEFAULT '' COMMENT '规格属性',
  `num`                 INT UNSIGNED     NOT NULL DEFAULT 1 COMMENT '数量',
  `price`               DECIMAL(12,2)    NOT NULL DEFAULT 0.00 COMMENT '单价',
  `total_fee`           DECIMAL(12,2)    NOT NULL DEFAULT 0.00 COMMENT '原总价',
  `discount_fee`        DECIMAL(12,2)    NOT NULL DEFAULT 0.00 COMMENT '优惠金额',
  `discount_rate`       DECIMAL(12,4)    DEFAULT 1.0000 COMMENT '折扣率',
  `payment`             DECIMAL(12,2)    NOT NULL DEFAULT 0.00 COMMENT '实付金额',
  `divide_order_fee`    DECIMAL(12,2)    NOT NULL DEFAULT 0.00 COMMENT '分摊金额',
  `cost`                DECIMAL(12,2)    NOT NULL DEFAULT 0.00 COMMENT '成本',
  `refund_status`       VARCHAR(32)      DEFAULT '' COMMENT '退款状态',
  `status`              VARCHAR(32)      DEFAULT '' COMMENT '快麦原始状态',
  `unified_status`      VARCHAR(32)      DEFAULT '' COMMENT '统一状态',
  `sys_status`          VARCHAR(32)      DEFAULT '' COMMENT '系统状态',
  `author_id`           VARCHAR(64)      DEFAULT '' COMMENT '达人ID',
  `author_name`         VARCHAR(128)     DEFAULT '' COMMENT '达人名称',
  `pic_path`            VARCHAR(512)     DEFAULT '' COMMENT '商品图片',
  `volume`              DECIMAL(12,4)    DEFAULT 0.0000 COMMENT '体积',
  `net_weight`          DECIMAL(12,4)    DEFAULT 0.0000 COMMENT '净重',
  `is_presell`          TINYINT          DEFAULT 0 COMMENT '是否预售',
  `is_virtual`          TINYINT          DEFAULT 0 COMMENT '是否虚拟商品',
  `is_cancel`           TINYINT          DEFAULT 0 COMMENT '是否取消',
  `pay_time`            DATETIME         DEFAULT NULL COMMENT '付款时间',
  `consign_time`        DATETIME         DEFAULT NULL COMMENT '发货时间',
  `end_time`            DATETIME         DEFAULT NULL COMMENT '完成时间',
  `created_at`          DATETIME         DEFAULT NULL COMMENT '创建时间',
  `upd_time`            DATETIME         NOT NULL COMMENT '最后更新时间',
  `synced_at`           DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '本记录同步时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_oid` (`oid`),
  KEY `idx_tid` (`tid`),
  KEY `idx_outer_sku_id` (`outer_sku_id`),
  KEY `idx_sku_id` (`sku_id`),
  KEY `idx_source` (`source`),
  KEY `idx_status` (`unified_status`),
  KEY `idx_synced_at` (`synced_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='快麦订单明细表';
